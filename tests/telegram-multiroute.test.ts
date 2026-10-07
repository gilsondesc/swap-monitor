// tests/telegram-multiroute.test.ts
// Valida o comportamento multi-rede e cooldown independente dos alertas Telegram
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateAndSendOpportunityAlert } from '../src/alerts/telegram';
import type { RouteStats } from '../src/services/statistics.service';

// Mock config
vi.mock('../src/config/config', () => ({
  config: {
    telegram: {
      enabled: true,
      botToken: 'fake-token',
      chatId: 'fake-chat',
      cooldownMinutes: 120,
      minImprovementPercent: 0.5,
      historyHours: 24,
    },
    sideshift: {
      enabled: true,
      apiKey: '',
      affiliateId: 'test-affiliate',
    },
    deflow: {
      enabled: false,
      apiKey: '',
    },
    swap: {
      source: { asset: 'DEPIX', network: 'liquid' },
      destination: { asset: 'USDG', network: 'ethereum' },
    },
    destinationNetworks: ['ethereum', 'solana', 'robinhood'],
    monitorAmount: 1000,
  },
}));

// Mock logger
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock DB
const stateDb = new Map<string, { last_alert_rate: number | null; last_alert_at: string | null }>();

vi.mock('../src/database/db', () => ({
  getTelegramAlertState: vi.fn((provider: string, srcAsset: string, srcNet: string, dstAsset: string, dstNet: string) => {
    const key = `${provider}:${srcAsset}:${srcNet}:${dstAsset}:${dstNet}`;
    const found = stateDb.get(key);
    if (!found) return null;
    return {
      provider,
      source_asset: srcAsset,
      source_network: srcNet,
      destination_asset: dstAsset,
      destination_network: dstNet,
      last_alert_rate: found.last_alert_rate,
      last_alert_at: found.last_alert_at,
    };
  }),
  upsertTelegramAlertState: vi.fn((state: any) => {
    const key = `${state.provider}:${state.source_asset}:${state.source_network}:${state.destination_asset}:${state.destination_network}`;
    stateDb.set(key, {
      last_alert_rate: state.last_alert_rate,
      last_alert_at: state.last_alert_at,
    });
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeTestRouteStats(network: string, amount: number, avg24h = amount - 2): RouteStats {
  return {
    provider: 'sideshift',
    source_asset: 'DEPIX',
    source_network: 'liquid',
    destination_asset: 'USDG',
    destination_network: network,
    route_key: `sideshift:usdg:${network}`,
    route_label: `SideShift (${network.charAt(0).toUpperCase() + network.slice(1)})`,
    count: 20,
    average_1h: avg24h,
    average_6h: avg24h,
    average_24h: avg24h,
    best_1h: amount,
    best_6h: amount,
    best_24h: amount,
    worst_1h: avg24h - 1,
    worst_6h: avg24h - 1,
    worst_24h: avg24h - 1,
    difference_vs_average_24h: 1.0,
    difference_vs_best_24h: 0,
    latest_quoted_amount: amount,
    effective_rate: amount / 1000,
    minimum_amount: 50,
    maximum_amount: 100000,
    status: 'online',
  };
}

describe('Alertas Telegram Multi-Rota', () => {
  beforeEach(() => {
    stateDb.clear();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });
  });

  it('cooldown é estritamente independente entre redes', async () => {
    // 1. Inicializa Robinhood
    const robRoute = makeTestRouteStats('robinhood', 193.20, 191.00);
    await evaluateAndSendOpportunityAlert(robRoute); // 1ª exec: inicializa

    // Força alerta em Robinhood após inicialização
    stateDb.set('sideshift:DEPIX:liquid:USDG:robinhood', {
      last_alert_rate: 191.00,
      last_alert_at: new Date(Date.now() - 150 * 60_000).toISOString(), // fora do cooldown
    });
    await evaluateAndSendOpportunityAlert(robRoute); // Dispara alerta Robinhood
    expect(mockFetch).toHaveBeenCalledOnce();

    const robSentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(robSentBody.text).toContain('DEPIX (Liquid) → USDG (Robinhood)');
    expect(robSentBody.text).toContain('SideShift (Robinhood)');

    // Agora Robinhood está em cooldown
    mockFetch.mockClear();
    await evaluateAndSendOpportunityAlert(robRoute);
    expect(mockFetch).not.toHaveBeenCalled(); // Bloqueado pelo cooldown de Robinhood

    // 2. Solana tem seu próprio estado e NÃO é bloqueada pelo cooldown de Robinhood
    stateDb.set('sideshift:DEPIX:liquid:USDG:solana', {
      last_alert_rate: 191.00,
      last_alert_at: new Date(Date.now() - 150 * 60_000).toISOString(), // fora do cooldown
    });
    const solRoute = makeTestRouteStats('solana', 193.15, 191.00);
    await evaluateAndSendOpportunityAlert(solRoute);

    // Deve disparar para Solana independentemente do cooldown ativo em Robinhood!
    expect(mockFetch).toHaveBeenCalledOnce();
    const solSentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(solSentBody.text).toContain('DEPIX (Liquid) → USDG (Solana)');
    expect(solSentBody.text).toContain('SideShift (Solana)');
  });
});
