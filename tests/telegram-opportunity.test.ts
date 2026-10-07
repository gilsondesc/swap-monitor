// tests/telegram-opportunity.test.ts
// Testes unitários do Radar de Oportunidades Telegram
// IMPORTANTE: Nenhum teste envia mensagem real ao Telegram.
//             Todos os envios são interceptados por mock.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcImprovementPct, evaluateAndSendOpportunityAlert } from '../src/alerts/telegram';
import type { ProviderStats } from '../src/services/statistics.service';

// ----------------------------------------------------------------
// Mocks de módulos externos
// ----------------------------------------------------------------

// Mock do config — começa com Telegram desabilitado (seguro por padrão)
vi.mock('../src/config/config', () => ({
  config: {
    telegram: {
      enabled: false,          // desabilitado por padrão em todos os testes
      botToken: 'test-token',
      chatId: 'test-chat',
      cooldownMinutes: 120,
      minImprovementPercent: 0.5,
      historyHours: 24,
    },
    swap: {
      source: { asset: 'DEPIX', network: 'liquid' },
      destination: { asset: 'USDC', network: 'arbitrum' },
    },
    monitorAmount: 1000,
  },
}));

// Mock do banco de dados — estado controlável por cada teste
vi.mock('../src/database/db', () => ({
  getTelegramAlertState: vi.fn(),
  upsertTelegramAlertState: vi.fn(),
}));

// Mock do logger — silencia logs nos testes
vi.mock('../src/utils/logger', () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  },
}));

// Mock de fetch — nunca chama API real do Telegram
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ----------------------------------------------------------------
// Imports após mocks (garante que mocks já estão registrados)
// ----------------------------------------------------------------
import { config } from '../src/config/config';
import { getTelegramAlertState, upsertTelegramAlertState } from '../src/database/db';

const mockGetState    = vi.mocked(getTelegramAlertState);
const mockUpsertState = vi.mocked(upsertTelegramAlertState);

// ----------------------------------------------------------------
// Helper: cria ProviderStats com valores padrão substituíveis
// ----------------------------------------------------------------
function makeStats(overrides: Partial<ProviderStats> = {}): ProviderStats {
  return {
    provider: 'sideshift',
    count: 20,
    average_1h:  188.0,
    average_6h:  187.5,
    average_24h: 188.0,
    best_1h:     189.0,
    best_6h:     188.5,
    best_24h:    189.5,
    worst_1h:    187.0,
    worst_6h:    186.5,
    worst_24h:   186.0,
    difference_vs_average_24h: null,
    difference_vs_best_24h:    null,
    latest_quoted_amount: 188.0,
    ...overrides,
  };
}

// Helper: força Telegram habilitado para os testes que precisam avaliar lógica
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enableTelegram(): void {
  (config.telegram as any).enabled = true;
}

// Helper: força Telegram desabilitado
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disableTelegram(): void {
  (config.telegram as any).enabled = false;
}

// Helper: simula resposta bem-sucedida do Telegram
function mockTelegramSuccess(): void {
  mockFetch.mockResolvedValue({
    ok: true,
    text: async () => '',
  });
}

// Helper: simula falha do Telegram
function mockTelegramFailure(): void {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });
}

// Helper: estado "após alerta enviado" com last_alert_at real
function stateWithAlert(rate: number, minutesAgo: number) {
  const lastAlertAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    provider: 'sideshift',
    source_asset: 'DEPIX',
    source_network: 'liquid',
    destination_asset: 'USDC',
    destination_network: 'arbitrum',
    last_alert_rate: rate,
    last_alert_at: lastAlertAt,
  };
}

// ----------------------------------------------------------------
// Suite de testes
// ----------------------------------------------------------------

describe('calcImprovementPct — cálculo de melhoria percentual', () => {
  it('Caso 13 — calcula corretamente com casas decimais', () => {
    // 188,00 → 188,20: +0,1064%
    const pct = calcImprovementPct(188.20, 188.00);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(0.1064, 3);
  });

  it('Caso 13b — calcula +0,532% corretamente (acima do limite de 0,5%)', () => {
    // 188,00 → 189,00: +0,5319%
    const pct = calcImprovementPct(189.00, 188.00);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(0.5319, 3);
    expect(pct!).toBeGreaterThanOrEqual(0.5);
  });

  it('Caso 14 — maior quantidade de USDC = melhor oportunidade', () => {
    // 189,20 é melhor que 188,10
    const pct = calcImprovementPct(189.20, 188.10);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0); // positivo = melhoria
  });

  it('retorna null para valor zero na referência', () => {
    expect(calcImprovementPct(189, 0)).toBeNull();
  });

  it('retorna null para valores inválidos (NaN / Infinity)', () => {
    expect(calcImprovementPct(NaN, 188)).toBeNull();
    expect(calcImprovementPct(189, Infinity)).toBeNull();
    expect(calcImprovementPct(Infinity, 188)).toBeNull();
  });

  it('retorna null para valores negativos', () => {
    expect(calcImprovementPct(-1, 188)).toBeNull();
    expect(calcImprovementPct(189, -1)).toBeNull();
  });
});

describe('evaluateAndSendOpportunityAlert — lógica de decisão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disableTelegram(); // padrão seguro
  });

  afterEach(() => {
    disableTelegram();
  });

  // ── Caso 11: Telegram desabilitado ──────────────────────────────
  it('Caso 11 — Telegram desabilitado: não faz nenhuma chamada', async () => {
    // Telegram já está disabled por padrão
    await evaluateAndSendOpportunityAlert('sideshift', makeStats());
    expect(mockGetState).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 10: Cotação inválida ───────────────────────────────────
  it('Caso 10 — cotação null: ignora com segurança', async () => {
    enableTelegram();
    mockGetState.mockReturnValue(null);
    await evaluateAndSendOpportunityAlert('sideshift', makeStats({ latest_quoted_amount: null }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Caso 10b — cotação zero: ignora com segurança', async () => {
    enableTelegram();
    mockGetState.mockReturnValue(null);
    await evaluateAndSendOpportunityAlert('sideshift', makeStats({ latest_quoted_amount: 0 }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Caso 10c — cotação NaN: ignora com segurança', async () => {
    enableTelegram();
    mockGetState.mockReturnValue(null);
    await evaluateAndSendOpportunityAlert('sideshift', makeStats({ latest_quoted_amount: NaN }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Primeira execução (sem estado no banco) ─────────────────────
  it('Caso 7a — primeira execução: inicializa estado sem enviar alerta', async () => {
    enableTelegram();
    mockGetState.mockReturnValue(null); // sem registro no banco

    await evaluateAndSendOpportunityAlert('sideshift', makeStats({ latest_quoted_amount: 188.0 }));

    // Deve persistir estado
    expect(mockUpsertState).toHaveBeenCalledOnce();
    // last_alert_at deve ser null (não foi um alerta real)
    expect(mockUpsertState.mock.calls[0][0].last_alert_at).toBeNull();
    // Não deve chamar fetch (sem envio)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 4: Dentro do cooldown ──────────────────────────────────
  it('Caso 4 — dentro do cooldown (30 min): não envia alerta', async () => {
    enableTelegram();
    // Alerta enviado há 30 minutos (cooldown = 120 min)
    mockGetState.mockReturnValue(stateWithAlert(188.0, 30));

    const stats = makeStats({ latest_quoted_amount: 189.5 }); // clara melhoria
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Nova máxima durante cooldown ────────────────────────────────
  it('Caso 6 — nova máxima durante cooldown: registra sem enviar', async () => {
    enableTelegram();
    // Alerta enviado há 60 min, rate=188.00; nova cotação = 190.00 (nova máxima)
    const existingState = stateWithAlert(188.0, 60);
    mockGetState.mockReturnValue(existingState);

    const stats = makeStats({ latest_quoted_amount: 190.0 });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    // Deve ter atualizado last_alert_rate sem enviar
    expect(mockUpsertState).toHaveBeenCalledOnce();
    const upsertArg = mockUpsertState.mock.calls[0][0];
    expect(upsertArg.last_alert_rate).toBe(190.0);
    // last_alert_at deve ser o mesmo (não mudou — não foi envio real)
    expect(upsertArg.last_alert_at).toBe(existingState.last_alert_at);
    // Não fez fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 2: Melhoria abaixo de 0,5% ────────────────────────────
  it('Caso 2 — melhoria de +0,106% (abaixo de 0,5%): não alerta', async () => {
    enableTelegram();
    // Alerta enviado há 150 min (após cooldown) — rate = 188.00
    mockGetState.mockReturnValue(stateWithAlert(188.0, 150));

    // 188.00 → 188.20 = +0.106%
    const stats = makeStats({
      latest_quoted_amount: 188.20,
      average_24h: 187.90,
      count: 20,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUpsertState).not.toHaveBeenCalled();
  });

  // ── Caso 3: Melhoria acima de 0,5% ─────────────────────────────
  it('Caso 3 — melhoria de +0,532% (acima de 0,5%): pode alertar', async () => {
    enableTelegram();
    mockTelegramSuccess();
    // Alerta enviado há 150 min (após cooldown) — rate = 188.00
    mockGetState.mockReturnValue(stateWithAlert(188.0, 150));

    // 188.00 → 189.00 = +0.532%
    const stats = makeStats({
      latest_quoted_amount: 189.0,
      average_24h: 187.5,
      count: 20,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).toHaveBeenCalledOnce();
    // Deve persistir novo estado com last_alert_at preenchido
    expect(mockUpsertState).toHaveBeenCalledOnce();
    expect(mockUpsertState.mock.calls[0][0].last_alert_at).not.toBeNull();
    expect(mockUpsertState.mock.calls[0][0].last_alert_rate).toBe(189.0);
  });

  // ── Caso 5: Após cooldown ───────────────────────────────────────
  it('Caso 5 — após cooldown (121 min) com melhoria suficiente: pode alertar novamente', async () => {
    enableTelegram();
    mockTelegramSuccess();
    // Alerta enviado há 121 min (cooldown = 120 min)
    mockGetState.mockReturnValue(stateWithAlert(188.0, 121));

    const stats = makeStats({
      latest_quoted_amount: 189.2,
      average_24h: 188.0,
      count: 20,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockUpsertState).toHaveBeenCalledOnce();
  });

  // ── Caso 1: Cotação normal (sem melhoria relevante) ─────────────
  it('Caso 1 — cotação normal sem melhoria vs histórico: não alerta', async () => {
    enableTelegram();
    // Alerta enviado há 150 min; cotação atual = mesma do alerta
    mockGetState.mockReturnValue(stateWithAlert(188.0, 150));

    const stats = makeStats({
      latest_quoted_amount: 188.0,  // igual ao último alerta = 0% de melhoria
      average_24h: 188.0,
      count: 20,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 9: Histórico insuficiente ─────────────────────────────
  it('Caso 9 — histórico insuficiente (count=1, average_24h null): não inventa média', async () => {
    enableTelegram();
    // Alerta enviado há 150 min
    mockGetState.mockReturnValue(stateWithAlert(188.0, 150));

    // Sem histórico suficiente para critério B; sem melhoria suficiente para critério A
    const stats = makeStats({
      latest_quoted_amount: 188.2,  // +0.106% — abaixo do limite
      average_24h: null,            // sem média
      count: 1,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 8: Média 24h calculada corretamente ────────────────────
  it('Caso 8 — melhoria acima de 0,5% vs média 24h (critério B): alerta', async () => {
    enableTelegram();
    mockTelegramSuccess();
    // Estado inicializado mas sem alerta enviado ainda (last_alert_at = null)
    mockGetState.mockReturnValue({
      provider: 'sideshift',
      source_asset: 'DEPIX',
      source_network: 'liquid',
      destination_asset: 'USDC',
      destination_network: 'arbitrum',
      last_alert_rate: 188.0,
      last_alert_at: null,         // nunca enviou alerta real
    });

    const stats = makeStats({
      latest_quoted_amount: 189.2, // +0.638% vs média 24h de 188.0 → critério B
      average_24h: 188.0,
      count: 10,
    });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    // Critério B satisfeito (sem cooldown pois last_alert_at é null)
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockUpsertState).toHaveBeenCalledOnce();
  });

  // ── Caso 7b: PM2 restart / estado persistido ────────────────────
  it('Caso 7b — restart do PM2: estado persistido evita alerta duplicado', async () => {
    enableTelegram();
    // Simula: antes do restart, alerta foi enviado há 10 min com rate=189.00
    mockGetState.mockReturnValue(stateWithAlert(189.0, 10));

    // Após restart, mesma cotação volta
    const stats = makeStats({ latest_quoted_amount: 189.0 });
    await evaluateAndSendOpportunityAlert('sideshift', stats);

    // Cooldown ativo (10 min < 120 min) + sem melhoria → sem alerta
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Caso 12: Erro do Telegram não derruba o monitor ────────────
  it('Caso 12 — falha no Telegram: monitor continua sem lançar exceção', async () => {
    enableTelegram();
    mockTelegramFailure();
    // Estado após cooldown com melhoria suficiente
    mockGetState.mockReturnValue(stateWithAlert(188.0, 150));

    const stats = makeStats({
      latest_quoted_amount: 189.5,
      average_24h: 188.0,
      count: 20,
    });

    // Não deve lançar exceção mesmo com falha do Telegram
    await expect(
      evaluateAndSendOpportunityAlert('sideshift', stats),
    ).resolves.not.toThrow();

    // Tentou enviar mas falhou
    expect(mockFetch).toHaveBeenCalledOnce();
    // Estado NÃO deve ser atualizado quando envio falhou
    expect(mockUpsertState).not.toHaveBeenCalled();
  });
});
