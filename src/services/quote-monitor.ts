import { config } from '../config/config';
import { fetchSideShiftQuote } from '../providers/sideshift/client';
import { fetchDeFlowQuote } from '../providers/deflow/client';
import { getMockSideShiftQuote, getMockDeFlowQuote } from '../mock/mock-provider';
import { insertQuote, updateProviderStatus } from '../database/db';
import { compareBestProvider } from './comparison.service';
import { getAllProvidersStats, getProviderStats } from './statistics.service';
import { evaluateAndSendOpportunityAlert } from '../alerts/telegram';
import { logger } from '../utils/logger';

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let pollingInProgress = false;

export function isPolling(): boolean {
  return pollingInProgress;
}

export async function waitForCurrentPoll(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (pollingInProgress && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function collectQuotes(): Promise<void> {
  if (pollingInProgress) {
    logger.warn('[MONITOR] Coleta anterior ainda em andamento. Pulando ciclo para evitar sobreposição.');
    return;
  }
  pollingInProgress = true;

  try {
    const amount = config.monitorAmount;
    const results = [];

  // ---- SideShift ----
  if (config.sideshift.enabled || config.mockMode) {
    try {
      const quote = config.mockMode
        ? getMockSideShiftQuote(amount)
        : await fetchSideShiftQuote(amount);

      insertQuote({
        provider: 'sideshift',
        source_asset: config.swap.source.asset,
        source_network: config.swap.source.network,
        destination_asset: config.swap.destination.asset,
        destination_network: config.swap.destination.network,
        source_amount: amount,
        quoted_amount: quote.quotedAmount,
        effective_rate: quote.effectiveRate,
        minimum_amount: quote.minimumAmount,
        maximum_amount: quote.maximumAmount,
        network_fee: quote.networkFee,
        service_fee: quote.serviceFee,
        quote_type: quote.quoteType,
        quote_id: quote.quoteId,
        raw_response: quote.rawResponse,
        success: quote.success ? 1 : 0,
        error_message: quote.error ?? null,
        observed_at: quote.observedAt,
      });

      updateProviderStatus(
        'sideshift',
        quote.success ? 'online' : 'error',
        quote.success ? null : (quote.error ?? 'Erro desconhecido'),
      );

      results.push({ provider: 'sideshift', success: quote.success });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SIDESHIFT] ERRO CRÍTICO: ${msg}`);
      updateProviderStatus('sideshift', 'error', msg);
    }
  }

  // ---- DeFlow ----
  if (config.deflow.enabled || config.mockMode) {
    try {
      const quote = config.mockMode
        ? getMockDeFlowQuote(amount)
        : await fetchDeFlowQuote(amount);

      const status =
        quote.status === 'suspended'         ? 'suspended' :
        quote.status === 'pending_validation' ? 'pending_validation' :
        quote.status === 'disabled'           ? 'disabled' :
        quote.success ? 'online' : 'error';

      insertQuote({
        provider: 'deflow',
        source_asset: config.swap.source.asset,
        source_network: config.swap.source.network,
        destination_asset: config.swap.destination.asset,
        destination_network: config.swap.destination.network,
        source_amount: amount,
        quoted_amount: quote.quotedAmount,
        effective_rate: quote.effectiveRate,
        minimum_amount: quote.minimumAmount,
        maximum_amount: quote.maximumAmount,
        network_fee: quote.networkFee,
        service_fee: quote.serviceFee,
        quote_type: quote.quoteType,
        quote_id: quote.quoteId,
        raw_response: quote.rawResponse,
        success: quote.success ? 1 : 0,
        error_message: quote.error ?? null,
        observed_at: quote.observedAt,
      });

      updateProviderStatus('deflow', status, quote.success ? null : (quote.error ?? null));
      results.push({ provider: 'deflow', success: quote.success });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DEFLOW] ERRO CRÍTICO: ${msg}`);
      updateProviderStatus('deflow', 'error', msg);
    }
  }

  // ---- Comparação e log ----
  const providerNames = ['sideshift', 'deflow'];
  const stats = getAllProvidersStats(providerNames);
  const comparison = compareBestProvider(stats);

  if (comparison.best_provider) {
    console.log(`[COMPARE] best provider: ${comparison.best_provider} (${comparison.best_quoted_amount} USDG)`);
    if (comparison.provider_difference_label) {
      console.log(`[COMPARE] diferença: ${comparison.provider_difference_label}`);
    }
  }

  // ---- Alertas Telegram (Radar de Oportunidades) ----
  // Avalia e envia alerta apenas para SideShift (provider ativo).
  // A função é tolerante a falhas: nunca derruba o monitor.
  if (config.sideshift.enabled || config.mockMode) {
    const sideshiftStats = getProviderStats('sideshift');
    evaluateAndSendOpportunityAlert('sideshift', sideshiftStats).catch((err) => {
      logger.error('[TELEGRAM] erro inesperado no avaliador:', err);
    });
  }

  logger.info(`[MONITOR] próxima atualização em ${config.quoteIntervalSeconds}s`);
  } finally {
    pollingInProgress = false;
  }
}

export function startMonitor(): void {
  logger.info(`[MONITOR] iniciando — intervalo: ${config.quoteIntervalSeconds}s — amount: ${config.monitorAmount} DEPIX`);
  logger.info(`[MONITOR] modo: ${config.mockMode ? 'MOCK' : 'REAL'}`);

  // Primeira coleta imediata
  collectQuotes().catch((e) => logger.error('[MONITOR] erro na coleta inicial:', e));

  monitorInterval = setInterval(() => {
    collectQuotes().catch((e) => logger.error('[MONITOR] erro na coleta:', e));
  }, config.quoteIntervalSeconds * 1000);
}

export function stopMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('[MONITOR] parado');
  }
}
