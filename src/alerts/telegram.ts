// src/alerts/telegram.ts
// Alertas via Telegram — Nunca imprime tokens ou secrets nos logs

import { config } from '../config/config';
import { logger } from '../utils/logger';
import {
  getTelegramAlertState,
  upsertTelegramAlertState,
} from '../database/db';
import type { ProviderStats } from '../services/statistics.service';

// ----------------------------------------------------------------
// Envio básico (mantido da versão anterior — sem alterações)
// ----------------------------------------------------------------

export async function sendTelegramAlert(message: string): Promise<boolean> {
  if (!config.telegram.enabled) return false;
  if (!config.telegram.botToken || !config.telegram.chatId) {
    logger.warn('[TELEGRAM] habilitado mas TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(`[TELEGRAM] falha ao enviar (${res.status}): ${body}`);
      return false;
    }

    logger.info('[TELEGRAM] alerta enviado');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[TELEGRAM] erro de rede: ${msg}`);
    return false;
  }
}

// ----------------------------------------------------------------
// Teste de conexão (mantido da versão anterior — sem alterações)
// ----------------------------------------------------------------

export async function testTelegramConnection(
  botToken?: string,
  chatId?: string,
): Promise<{ success: boolean; message: string }> {
  const token = botToken || config.telegram.botToken;
  const chat = chatId || config.telegram.chatId;

  if (!token || !chat) {
    return { success: false, message: 'TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID são obrigatórios.' };
  }

  const testMsg =
    `🤖 <b>Swap Monitor — Teste de Notificação</b>\n\n` +
    `✅ Integração com Telegram configurada e ativa!\n` +
    `📊 Monitorando: <b>${config.swap.source.asset} (${config.swap.source.network}) → ${config.swap.destination.asset} (${config.swap.destination.network})</b>\n` +
    `⏱️ Horário: <code>${new Date().toLocaleTimeString('pt-BR')}</code>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: testMsg, parse_mode: 'HTML' }),
    });

    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      return { success: false, message: data.description || 'Erro ao enviar mensagem pelo Telegram' };
    }

    return { success: true, message: 'Mensagem de teste enviada com sucesso no Telegram!' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Erro de conexão: ${msg}` };
  }
}

// ----------------------------------------------------------------
// Radar de Oportunidades
// ----------------------------------------------------------------

/**
 * Calcula a melhoria percentual de `current` em relação a `reference`.
 * Retorna null se algum valor for inválido ou reference === 0.
 */
export function calcImprovementPct(current: number, reference: number): number | null {
  if (
    !isFinite(current) || !isFinite(reference) ||
    reference === 0 || current <= 0 || reference <= 0
  ) {
    return null;
  }
  return ((current - reference) / reference) * 100;
}

/**
 * Formata a mensagem de oportunidade conforme o template especificado.
 * Usa DEPIX → USDC (Arbitrum) conforme a rota principal do sistema.
 */
function buildOpportunityMessage(
  provider: string,
  stats: ProviderStats,
  amount: number,
  pctVsAvg: number | null,
  now: Date,
): string {
  const providerLabel = provider === 'sideshift' ? 'SideShift' : provider;
  const quotedAmount = stats.latest_quoted_amount!;

  const dateStr = now.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

  const avgLine = stats.average_24h !== null
    ? `\n📊 Média 24h:\n${stats.average_24h.toFixed(2)} USDC`
    : '';

  const improvLine = pctVsAvg !== null
    ? `\n📈 Acima da média:\n+${pctVsAvg.toFixed(2)}%`
    : '';

  const bestLine = stats.best_24h !== null
    ? `\n🏆 Melhor cotação 24h:\n${stats.best_24h.toFixed(2)} USDC`
    : '';

  return (
    `🔔 <b>OPORTUNIDADE DE SWAP</b>\n\n` +
    `DEPIX → USDC Arbitrum\n` +
    `\n💰 Valor analisado:\n${amount.toLocaleString('pt-BR')} DEPIX` +
    `\n💵 Cotação atual:\n${quotedAmount.toFixed(2)} USDC` +
    avgLine +
    improvLine +
    bestLine +
    `\n🏦 Provider:\n${providerLabel}` +
    `\n🕐 ${dateStr} ${timeStr}` +
    `\n\n⚠️ Monitoramento consultivo.\nNenhuma transação foi executada.`
  );
}

/**
 * Avalia se a cotação atual representa uma oportunidade relevante e,
 * se positivo, envia o alerta via Telegram.
 *
 * Regras (todas devem ser satisfeitas para envio):
 *   1. Telegram habilitado (TELEGRAM_ENABLED=true)
 *   2. Cotação atual válida (quoted_amount não-nulo, finito, > 0)
 *   3. Cooldown respeitado (TELEGRAM_COOLDOWN_MINUTES desde o último envio)
 *   4. Melhoria suficiente:
 *      A) >= TELEGRAM_MIN_IMPROVEMENT_PERCENT vs último alerta enviado
 *      OU
 *      B) >= TELEGRAM_MIN_IMPROVEMENT_PERCENT vs média 24h
 *         (somente se histórico disponível)
 *
 * Primeira execução (sem estado no banco):
 *   Inicializa o estado com a cotação atual sem enviar alerta.
 *   O cooldown natural de 120 min garante que o próximo alerta
 *   só seja possível após dados históricos suficientes.
 *
 * Falhas do Telegram nunca propagam exceção — o monitor continua.
 */
export async function evaluateAndSendOpportunityAlert(
  provider: string,
  stats: ProviderStats,
): Promise<void> {
  // Guard 1: Telegram desabilitado — silêncio total
  if (!config.telegram.enabled) return;

  const sourceAsset      = config.swap.source.asset;
  const sourceNetwork    = config.swap.source.network;
  const destinationAsset = config.swap.destination.asset;
  const destNetwork      = config.swap.destination.network;
  const amount           = config.monitorAmount;

  // Guard 2: Cotação inválida
  const currentRate = stats.latest_quoted_amount;
  if (
    currentRate === null ||
    !isFinite(currentRate) ||
    currentRate <= 0
  ) {
    return;
  }

  try {
    const state = getTelegramAlertState(
      provider, sourceAsset, sourceNetwork, destinationAsset, destNetwork,
    );

    const now    = Date.now();
    const nowIso = new Date(now).toISOString();
    const cooldownMs = config.telegram.cooldownMinutes * 60_000;
    const minPct     = config.telegram.minImprovementPercent;

    // ── Primeira execução (sem registro no banco) ─────────────────
    if (state === null) {
      // Inicializa estado com cotação atual; NÃO envia alerta.
      // Decisão: evitar "ativar Telegram → pegar primeira cotação → alerta sem contexto".
      upsertTelegramAlertState({
        provider,
        source_asset: sourceAsset,
        source_network: sourceNetwork,
        destination_asset: destinationAsset,
        destination_network: destNetwork,
        last_alert_rate: currentRate,
        last_alert_at: null,           // null = nunca enviou alerta real
      });
      logger.info(`[TELEGRAM] estado inicializado para ${provider} (${currentRate.toFixed(2)} — sem alerta na primeira execução)`);
      return;
    }

    // ── Verificar cooldown ────────────────────────────────────────
    if (state.last_alert_at !== null) {
      const lastAlertMs = new Date(state.last_alert_at).getTime();
      const elapsed     = now - lastAlertMs;

      if (elapsed < cooldownMs) {
        const remainMin = Math.ceil((cooldownMs - elapsed) / 60_000);
        logger.info(`[TELEGRAM] cooldown ativo — próximo alerta disponível em ${remainMin} min`);

        // Mesmo em cooldown, atualiza last_alert_rate se for nova máxima
        // para que o próximo alerta (após cooldown) use a referência correta.
        if (
          state.last_alert_rate !== null &&
          currentRate > state.last_alert_rate
        ) {
          // Não atualiza last_alert_at — não foi um alerta enviado
          upsertTelegramAlertState({ ...state, last_alert_rate: currentRate });
        }
        return;
      }
    }

    // ── Calcular melhorias ────────────────────────────────────────
    const pctVsLastAlert  = state.last_alert_rate !== null
      ? calcImprovementPct(currentRate, state.last_alert_rate)
      : null;

    const pctVsAvg24h = stats.average_24h !== null
      ? calcImprovementPct(currentRate, stats.average_24h)
      : null;

    // Critério A: melhoria vs último alerta (se existir e for suficiente)
    const criteriaA = pctVsLastAlert !== null && pctVsLastAlert >= minPct;

    // Critério B: melhoria vs média 24h (se histórico disponível e suficiente)
    // Exige pelo menos 2 pontos de histórico para não inventar média
    const criteriaB = pctVsAvg24h !== null &&
                      pctVsAvg24h >= minPct &&
                      stats.count >= 2;

    if (!criteriaA && !criteriaB) {
      const pctStr = pctVsLastAlert !== null ? `${pctVsLastAlert.toFixed(3)}%` : 'N/A';
      logger.info(`[TELEGRAM] alerta ignorado: melhoria abaixo do limite (vs último alerta: ${pctStr}, mín: ${minPct}%)`);
      return;
    }

    // ── Elegível — enviar alerta ──────────────────────────────────
    logger.info(`[TELEGRAM] oportunidade detectada para ${provider}: ${currentRate.toFixed(2)} USDC`);

    const message = buildOpportunityMessage(
      provider, stats, amount, pctVsAvg24h, new Date(now),
    );

    const sent = await sendTelegramAlert(message);

    if (sent) {
      // Persiste estado com last_alert_at real (timestamp de envio confirmado)
      upsertTelegramAlertState({
        provider,
        source_asset: sourceAsset,
        source_network: sourceNetwork,
        destination_asset: destinationAsset,
        destination_network: destNetwork,
        last_alert_rate: currentRate,
        last_alert_at: nowIso,
      });
    } else {
      logger.warn('[TELEGRAM] falha no envio — estado não atualizado (monitor continua normalmente)');
    }
  } catch (err) {
    // Nunca derruba o monitor por erro no Telegram
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[TELEGRAM] erro interno no avaliador de oportunidade: ${msg}`);
  }
}
