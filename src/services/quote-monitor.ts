import { config } from '../config/config';
import { fetchSideShiftQuote } from '../providers/sideshift/client';
import { fetchDeFlowQuote } from '../providers/deflow/client';
import { getMockSideShiftQuote, getMockDeFlowQuote } from '../mock/mock-provider';
import { insertQuote, updateProviderStatus } from '../database/db';
import { compareBestRoute, compareBestProvider } from './comparison.service';
import { getAllActiveRoutesStats, getAllProvidersStats, getProviderStats } from './statistics.service';
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
    const networks = config.destinationNetworks;
    const destAsset = config.swap.destination.asset;
    const srcAsset = config.swap.source.asset;
    const srcNetwork = config.swap.source.network;

    // ---- SideShift Multi-Rota (Ethereum, Solana, Robinhood) ----
    if (config.sideshift.enabled || config.mockMode) {
      const routePromises = networks.map(async (net) => {
        try {
          const quote = config.mockMode
            ? getMockSideShiftQuote(amount, net, destAsset)
            : await fetchSideShiftQuote(amount, net, destAsset);

          insertQuote({
            provider: 'sideshift',
            source_asset: srcAsset,
            source_network: srcNetwork,
            destination_asset: destAsset,
            destination_network: net,
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

          return { network: net, success: quote.success, quotedAmount: quote.quotedAmount };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[SIDESHIFT] ERRO NA ROTA ${net}: ${msg}`);
          insertQuote({
            provider: 'sideshift',
            source_asset: srcAsset,
            source_network: srcNetwork,
            destination_asset: destAsset,
            destination_network: net,
            source_amount: amount,
            quoted_amount: null,
            effective_rate: null,
            minimum_amount: null,
            maximum_amount: null,
            network_fee: null,
            service_fee: null,
            quote_type: null,
            quote_id: null,
            raw_response: JSON.stringify({ error: msg }),
            success: 0,
            error_message: msg,
          });
          return { network: net, success: false, error: msg };
        }
      });

      const settled = await Promise.allSettled(routePromises);
      const anySuccess = settled.some(
        (s) => s.status === 'fulfilled' && s.value.success,
      );

      updateProviderStatus(
        'sideshift',
        anySuccess ? 'online' : 'error',
        anySuccess ? null : 'Falha na coleta de todas as rotas SideShift',
      );
    }

    // ---- DeFlow (preservado como suspenso / desabilitado) ----
    if (config.deflow.enabled || config.mockMode) {
      try {
        const quote = config.mockMode
          ? getMockDeFlowQuote(amount)
          : await fetchDeFlowQuote(amount);

        const status =
          quote.status === 'suspended'          ? 'suspended' :
          quote.status === 'pending_validation' ? 'pending_validation' :
          quote.status === 'disabled'           ? 'disabled' :
          quote.success ? 'online' : 'error';

        insertQuote({
          provider: 'deflow',
          source_asset: srcAsset,
          source_network: srcNetwork,
          destination_asset: destAsset,
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[DEFLOW] ERRO CRÍTICO: ${msg}`);
        updateProviderStatus('deflow', 'error', msg);
      }
    }

    // ---- Comparação e Ranking das Rotas ----
    const activeRouteStats = getAllActiveRoutesStats();
    const routeComparison = compareBestRoute(activeRouteStats);

    if (routeComparison.best_route) {
      console.log(
        `[COMPARE] melhor rota: ${routeComparison.best_label} (${routeComparison.best_quoted_amount} ${destAsset})`,
      );
      if (routeComparison.provider_difference_label) {
        console.log(`[COMPARE] diferença: ${routeComparison.provider_difference_label}`);
      }
    }

    // ---- Alertas Telegram (Radar de Oportunidades) ----
    // Avalia a melhor rota do ciclo com cooldown e métricas próprias por rede.
    if ((config.sideshift.enabled || config.mockMode) && routeComparison.best_route) {
      evaluateAndSendOpportunityAlert(routeComparison.best_route).catch((err) => {
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
