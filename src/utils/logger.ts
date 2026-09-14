// src/utils/logger.ts
// Logger centralizado com níveis INFO, WARN, ERROR e mascaramento estrito de secrets

import { config } from '../config/config';

/**
 * Mascara qualquer secret, token ou chave sensível de uma string de log.
 */
export function maskSecrets(message: string): string {
  if (!message || typeof message !== 'string') return '';

  let sanitized = message;

  // 1. Mascarar padrões conhecidos de tokens do Telegram (ex: 123456789:ABCdefGhIjk...)
  sanitized = sanitized.replace(
    /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g,
    '[REDACTED_TELEGRAM_TOKEN]',
  );

  // 2. Mascarar tokens conhecidos vindos da configuração ativa
  const knownSecrets = [
    config.sideshift.apiKey,
    config.deflow.apiKey,
    config.telegram.botToken,
  ].filter((s): s is string => Boolean(s && s.length >= 4));

  for (const secret of knownSecrets) {
    // Escapar caracteres especiais de regex
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }

  // 3. Mascarar parâmetros sensíveis em URLs (ex: secret=xxx, apiKey=xxx, token=xxx)
  sanitized = sanitized.replace(
    /([?&](?:api_?key|secret|token|bot_?token)=)[^&\s]+/gi,
    '$1[REDACTED]',
  );

  // 4. Mascarar cabeçalhos de autorização comuns
  sanitized = sanitized.replace(
    /(['"]?(?:x-sideshift-secret|authorization|bearer)['"]?\s*[:=]\s*['"]?)[^'",\s]+/gi,
    '$1[REDACTED]',
  );

  return sanitized;
}

function formatLog(level: 'INFO' | 'WARN' | 'ERROR', msg: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  let text = msg;
  if (args.length > 0) {
    const formattedArgs = args.map((a) => {
      if (a instanceof Error) {
        return config.isProduction ? a.message : (a.stack || a.message);
      }
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    }).join(' ');
    text = `${text} ${formattedArgs}`;
  }
  return `[${timestamp}] [${level}] ${maskSecrets(text)}`;
}

export const logger = {
  info(msg: string, ...args: unknown[]): void {
    console.log(formatLog('INFO', msg, ...args));
  },

  warn(msg: string, ...args: unknown[]): void {
    console.warn(formatLog('WARN', msg, ...args));
  },

  error(msg: string, ...args: unknown[]): void {
    console.error(formatLog('ERROR', msg, ...args));
  },
};
