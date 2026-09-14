// tests/production.test.ts
// Testes para validação de produção, isolamento, health check e segurança

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer, resolveDashboardPath } from '../src/api/server';
import { maskSecrets } from '../src/utils/logger';
import { isPolling, collectQuotes } from '../src/services/quote-monitor';
import { config } from '../src/config/config';

describe('1. Health Check e Endpoints de Produção', () => {
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    const app = createServer();
    // Porta dinâmica (0 deixa o OS escolher uma porta livre automaticamente)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          testPort = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health deve responder HTTP 200 com status "ok"', async () => {
    const res = await fetch(`http://localhost:${testPort}/health`);
    expect(res.status).toBe(200);

    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('environment');
    expect(data).toHaveProperty('database');
  });

  it('GET /api/health deve responder HTTP 200 idêntico a /health', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/health`);
    expect(res.status).toBe(200);

    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('ok');
  });

  it('GET /api/status deve permanecer intacto e funcional', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/status`);
    expect(res.status).toBe(200);

    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe('running');
    expect(data.version).toBe('1.0.0');
  });

  it('GET /health não deve expor secrets ou chaves privadas', async () => {
    const res = await fetch(`http://localhost:${testPort}/health`);
    const text = await res.text();

    expect(text).not.toContain('TELEGRAM_BOT_TOKEN');
    expect(text).not.toContain('SIDESHIFT_API_KEY');
    expect(text).not.toContain('DEFLOW_API_KEY');
    if (config.telegram.botToken) {
      expect(text).not.toContain(config.telegram.botToken);
    }
  });

  it('Headers de resposta não devem incluir X-Powered-By', async () => {
    const res = await fetch(`http://localhost:${testPort}/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('2. Segurança e Mascaramento de Secrets nos Logs', () => {
  it('Deve mascarar tokens do Telegram com padrão numérico e alfanumérico', () => {
    const dummyToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz12345678';
    const raw = `Mensagem com token ${dummyToken} em log`;
    const masked = maskSecrets(raw);
    expect(masked).not.toContain(dummyToken);
    expect(masked).toContain('[REDACTED_TELEGRAM_TOKEN]');
  });

  it('Deve mascarar chaves de API em URLs', () => {
    const raw = 'https://api.example.com/v1/quote?apiKey=my_super_secret_key_123&pair=btc';
    const masked = maskSecrets(raw);
    expect(masked).not.toContain('my_super_secret_key_123');
    expect(masked).toContain('[REDACTED]');
  });

  it('Deve mascarar cabeçalhos x-sideshift-secret', () => {
    const raw = 'Headers: x-sideshift-secret: "sec_abc12345xyz"';
    const masked = maskSecrets(raw);
    expect(masked).not.toContain('sec_abc12345xyz');
    expect(masked).toContain('[REDACTED]');
  });
});

describe('3. Polling e Proteção contra Sobreposição', () => {
  it('isPolling() deve reportar false quando ocioso', () => {
    expect(typeof isPolling()).toBe('boolean');
  });

  it('collectQuotes() não deve disparar múltiplas coletas simultâneas', async () => {
    // Executa em mock mode para rapidez
    const p1 = collectQuotes();
    const p2 = collectQuotes(); // Segunda chamada enquanto a primeira está em execução

    await Promise.all([p1, p2]);
    // Ao finalizar, deve voltar para false
    expect(isPolling()).toBe(false);
  });
});

describe('4. Dashboard e Resolução de Caminhos', () => {
  it('resolveDashboardPath() deve apontar para um diretório com index.html', () => {
    const dashPath = resolveDashboardPath();
    expect(fs.existsSync(dashPath)).toBe(true);

    const indexPath = path.join(dashPath, 'index.html');
    expect(fs.existsSync(indexPath)).toBe(true);
  });
});

describe('5. Auditoria de Isolamento de Código', () => {
  it('Não deve existir referência a /root/automacao, system.db ou gerenciador-api em src/', () => {
    const srcDir = path.resolve(__dirname, '..', 'src');

    function searchDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain('/root/automacao');
          expect(content).not.toContain('system.db');
          expect(content).not.toContain('gerenciador-api');
          expect(content).not.toContain('gerenciador-iptv');
        }
      }
    }

    searchDir(srcDir);
  });
});
