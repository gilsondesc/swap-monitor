// src/config/config.ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  }
  return val;
}

function bool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

function num(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
}

const nodeEnv = process.env['NODE_ENV'] || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProduction,
  port: num('PORT', 3000),
  corsOrigin: process.env['CORS_ORIGIN'] || (isProduction ? '' : '*'),
  mockMode: bool('MOCK_MODE', true),
  monitorAmount: num('MONITOR_AMOUNT', 1000),
  quoteIntervalSeconds: num('QUOTE_INTERVAL_SECONDS', 300),

  databasePath: path.resolve(process.env['DATABASE_PATH'] ?? './data/swap-monitor.db'),

  sideshift: {
    enabled: bool('SIDESHIFT_ENABLED', true),
    apiBaseUrl: process.env['SIDESHIFT_API_BASE_URL'] ?? 'https://sideshift.ai/api/v2',
    apiKey: process.env['SIDESHIFT_API_KEY'] ?? '',
    affiliateId: process.env['SIDESHIFT_AFFILIATE_ID'] ?? '',
  },

  deflow: {
    enabled: bool('DEFLOW_ENABLED', false),
    apiBaseUrl: process.env['DEFLOW_API_BASE_URL'] ?? '',
    apiKey: process.env['DEFLOW_API_KEY'] ?? '',
    // NUNCA logar apiKey ou apiSecret
  },

  telegram: {
    enabled: bool('TELEGRAM_ENABLED', false),
    // Tokens nunca aparecem em logs
    botToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
    chatId: process.env['TELEGRAM_CHAT_ID'] ?? '',
    // Radar de Oportunidades — parâmetros de decisão
    cooldownMinutes: num('TELEGRAM_COOLDOWN_MINUTES', 120),
    minImprovementPercent: num('TELEGRAM_MIN_IMPROVEMENT_PERCENT', 0.5),
    historyHours: num('TELEGRAM_HISTORY_HOURS', 24),
  },

  // Redes e ativos monitorados
  destinationNetworks: (process.env['DESTINATION_NETWORKS']
    ?.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) ?? ['ethereum', 'solana', 'robinhood']),

  // Ativos monitorados
  swap: {
    source: {
      asset: process.env['SOURCE_ASSET'] ?? 'DEPIX',
      network: process.env['SOURCE_NETWORK'] ?? 'liquid',
    },
    destination: {
      asset: process.env['DESTINATION_ASSET'] ?? 'USDG',
      network: process.env['DESTINATION_NETWORK'] ?? 'ethereum',
      networks: (process.env['DESTINATION_NETWORKS']
        ?.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) ?? ['ethereum', 'solana', 'robinhood']),
    },
  },

  // Timeouts e retries
  http: {
    timeoutMs: 15_000,
    maxRetries: 3,
    retryBaseMs: 1_000,
  },
} as const;

export type Config = typeof config;
