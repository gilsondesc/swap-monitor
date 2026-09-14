// src/index.ts — Ponto de entrada principal
import 'dotenv/config';
import { getDb, closeDb } from './database/db';
import { startServer, closeServer } from './api/server';
import { startMonitor, stopMonitor, waitForCurrentPoll } from './services/quote-monitor';
import { logger } from './utils/logger';

console.log('╔══════════════════════════════════════════╗');
console.log('║         SWAP MONITOR  v1.0.0             ║');
console.log('║   DEPIX (Liquid) → USDG (Arbitrum)      ║');
console.log('║   Apenas monitoramento — sem execução    ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// Inicializa banco (cria tabelas e índices se não existirem)
try {
  getDb();
  logger.info('[DB] SQLite inicializado');
} catch (err) {
  logger.error('[DB] Erro fatal ao inicializar banco:', err);
  process.exit(1);
}

// Inicia servidor HTTP
startServer();

// Inicia loop de monitoramento
startMonitor();

// Graceful shutdown controlado para PM2 e sinais de sistema
let isShuttingDown = false;

export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[SHUTDOWN] Sinal ${signal} recebido. Encerrando serviços de forma graciosa...`);

  // Timeout de segurança para não prender o PM2
  const forceExit = setTimeout(() => {
    logger.error('[SHUTDOWN] Limite de tempo excedido durante shutdown. Forçando finalização.');
    process.exit(1);
  }, 8000);
  forceExit.unref();

  try {
    // 1. Para novos agendamentos
    stopMonitor();

    // 2. Aguarda coleta em andamento terminar (máximo 4s)
    await waitForCurrentPoll(4000);

    // 3. Fecha servidor HTTP
    await closeServer();

    // 4. Fecha conexão SQLite garantindo flush de WAL
    closeDb();
    logger.info('[SHUTDOWN] Banco SQLite fechado.');

    clearTimeout(forceExit);
    logger.info('[SHUTDOWN] Processo finalizado com sucesso.');
    process.exit(0);
  } catch (err) {
    logger.error('[SHUTDOWN] Erro ao encerrar processo:', err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});
