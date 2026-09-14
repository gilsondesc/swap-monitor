// src/alerts/telegram.ts
// Alertas via Telegram — Nunca imprime tokens ou secrets nos logs

import { config } from '../config/config';

export async function sendTelegramAlert(message: string): Promise<boolean> {
  if (!config.telegram.enabled) return false;
  if (!config.telegram.botToken || !config.telegram.chatId) {
    console.warn('[TELEGRAM] habilitado mas TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
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
      console.error(`[TELEGRAM] falha ao enviar (${res.status}): ${body}`);
      return false;
    }

    console.log('[TELEGRAM] alerta enviado com sucesso');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TELEGRAM] erro de rede: ${msg}`);
    return false;
  }
}

export async function testTelegramConnection(botToken?: string, chatId?: string): Promise<{ success: boolean; message: string }> {
  const token = botToken || config.telegram.botToken;
  const chat = chatId || config.telegram.chatId;

  if (!token || !chat) {
    return { success: false, message: 'TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID são obrigatórios.' };
  }

  const testMsg = `🤖 <b>Swap Monitor — Teste de Notificação</b>\n\n` +
    `✅ Integração com Telegram configurada e ativa!\n` +
    `📊 Monitorando: <b>${config.swap.source.asset} (${config.swap.source.network}) → ${config.swap.destination.asset} (${config.swap.destination.network})</b>\n` +
    `⏱️ Horário: <code>${new Date().toLocaleTimeString('pt-BR')}</code>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: testMsg,
        parse_mode: 'HTML',
      }),
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

