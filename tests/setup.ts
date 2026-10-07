// tests/setup.ts
// Setup global para suíte de testes Vitest
// Garante isolamento absoluto: banco SQLite temporário e bloqueio de chamadas externas

import fs from 'fs';
import { afterAll, beforeEach } from 'vitest';

const testDbPath = process.env['DATABASE_PATH'];

// 1. BLOQUEIO DE CHAMADAS EXTERNAS REAIS (OFFLINE DETERMINÍSTICO):
// Intercepta globalThis.fetch para garantir que nenhum teste acesse a SideShift ou Telegram reais.
// Chamadas para localhost (usadas pelos testes de endpoints da API) continuam autorizadas.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/sideshift\.ai|api\.telegram\.org/i.test(url)) {
    throw new Error(`[TEST ISOLATION VIOLATION] Chamada externa bloqueada em ambiente de teste: ${url}`);
  }
  return originalFetch(input, init);
};

// 2. LIMPEZA DOS ARTEFATOS TEMPORÁRIOS
afterAll(async () => {
  try {
    const { closeDb } = await import('../src/database/db');
    closeDb();
    if (testDbPath && fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (testDbPath) {
      const wal = `${testDbPath}-wal`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      const shm = `${testDbPath}-shm`;
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    }
  } catch {
    // Falha silenciosa em diretório temporário do sistema operacional
  }
});
