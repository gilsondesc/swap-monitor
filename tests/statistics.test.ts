// tests/statistics.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProviderStats } from '../src/services/statistics.service';

// Mock do módulo de banco de dados
vi.mock('../src/database/db', () => ({
  getQuotesHistory: vi.fn(),
}));

import { getQuotesHistory } from '../src/database/db';

const mockHistory = vi.mocked(getQuotesHistory);

describe('statistics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna nulls quando não há histórico', () => {
    mockHistory.mockReturnValue([]);
    const stats = getProviderStats('sideshift');
    expect(stats.average_1h).toBeNull();
    expect(stats.average_6h).toBeNull();
    expect(stats.average_24h).toBeNull();
    expect(stats.best_24h).toBeNull();
    expect(stats.worst_24h).toBeNull();
    expect(stats.count).toBe(0);
  });

  it('calcula média corretamente', () => {
    const makeRow = (amt: number) => ({
      id: 1, provider: 'sideshift',
      source_asset: 'DEPIX', source_network: 'liquid',
      destination_asset: 'USDG', destination_network: 'arbitrum',
      source_amount: 1000, quoted_amount: amt,
      effective_rate: amt / 1000, minimum_amount: null,
      maximum_amount: null, network_fee: null, service_fee: null,
      quote_type: 'variable', quote_id: null, raw_response: '{}',
      success: 1 as const, error_message: null, observed_at: new Date().toISOString(),
    });

    const rows = [makeRow(187), makeRow(188), makeRow(189)];
    mockHistory.mockReturnValue(rows);

    const stats = getProviderStats('sideshift');
    expect(stats.average_1h).toBeCloseTo(188, 2);
    expect(stats.best_1h).toBe(189);
    expect(stats.worst_1h).toBe(187);
  });

  it('calcula diferença percentual vs média', () => {
    const makeRow = (amt: number) => ({
      id: 1, provider: 'sideshift',
      source_asset: 'DEPIX', source_network: 'liquid',
      destination_asset: 'USDG', destination_network: 'arbitrum',
      source_amount: 1000, quoted_amount: amt,
      effective_rate: amt / 1000, minimum_amount: null,
      maximum_amount: null, network_fee: null, service_fee: null,
      quote_type: 'variable', quote_id: null, raw_response: '{}',
      success: 1 as const, error_message: null, observed_at: new Date().toISOString(),
    });

    // Média = 188, latest = 190 → +1.06%
    const rows = [makeRow(190), makeRow(187), makeRow(187)];
    mockHistory.mockReturnValue(rows);

    const stats = getProviderStats('sideshift');
    expect(stats.difference_vs_average_24h).not.toBeNull();
    expect(stats.difference_vs_average_24h!).toBeGreaterThan(0);
  });

  it('lida corretamente com valores null no banco', () => {
    const rowWithNull = {
      id: 1, provider: 'sideshift',
      source_asset: 'DEPIX', source_network: 'liquid',
      destination_asset: 'USDG', destination_network: 'arbitrum',
      source_amount: 1000, quoted_amount: null,
      effective_rate: null, minimum_amount: null, maximum_amount: null,
      network_fee: null, service_fee: null, quote_type: null, quote_id: null,
      raw_response: '{}', success: 0 as const, error_message: 'timeout',
      observed_at: new Date().toISOString(),
    };
    mockHistory.mockReturnValue([rowWithNull]);
    const stats = getProviderStats('sideshift');
    expect(stats.average_1h).toBeNull(); // filtered out
  });
});
