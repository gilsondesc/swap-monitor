// tests/history-preservation.test.ts
// Valida a preservação da rota histórica USDC/Arbitrum e o isolamento de estatísticas das novas rotas USDG
import { describe, it, expect, beforeEach } from 'vitest';
import { insertQuote, getLatestQuotes, getQuotesHistory } from '../src/database/db';
import { getRouteStats } from '../src/services/statistics.service';

describe('Preservação de Histórico e Isolamento de Métricas', () => {
  it('registros históricos USDC/Arbitrum coexistem perfeitamente com novas rotas USDG', () => {
    // Insere cotação simulando registro histórico legado
    insertQuote({
      provider: 'sideshift',
      source_asset: 'DEPIX',
      source_network: 'liquid',
      destination_asset: 'USDC',
      destination_network: 'arbitrum',
      source_amount: 1000,
      quoted_amount: 188.50,
      effective_rate: 0.1885,
      minimum_amount: 10,
      maximum_amount: 50000,
      network_fee: null,
      service_fee: null,
      quote_type: 'variable',
      quote_id: null,
      raw_response: '{}',
      success: 1,
      error_message: null,
      observed_at: new Date(Date.now() - 3600_000).toISOString(),
    });

    // Insere novas cotações para as 3 rotas USDG
    const now = new Date().toISOString();
    insertQuote({
      provider: 'sideshift',
      source_asset: 'DEPIX',
      source_network: 'liquid',
      destination_asset: 'USDG',
      destination_network: 'ethereum',
      source_amount: 1000,
      quoted_amount: 192.46,
      effective_rate: 0.19246,
      minimum_amount: 43.2,
      maximum_amount: 152118,
      network_fee: null,
      service_fee: null,
      quote_type: 'variable',
      quote_id: null,
      raw_response: '{}',
      success: 1,
      error_message: null,
      observed_at: now,
    });

    insertQuote({
      provider: 'sideshift',
      source_asset: 'DEPIX',
      source_network: 'liquid',
      destination_asset: 'USDG',
      destination_network: 'solana',
      source_amount: 1000,
      quoted_amount: 193.15,
      effective_rate: 0.19315,
      minimum_amount: 50.7,
      maximum_amount: 152118,
      network_fee: null,
      service_fee: null,
      quote_type: 'variable',
      quote_id: null,
      raw_response: '{}',
      success: 1,
      error_message: null,
      observed_at: now,
    });

    insertQuote({
      provider: 'sideshift',
      source_asset: 'DEPIX',
      source_network: 'liquid',
      destination_asset: 'USDG',
      destination_network: 'robinhood',
      source_amount: 1000,
      quoted_amount: 193.18,
      effective_rate: 0.19318,
      minimum_amount: 152.1,
      maximum_amount: 86529,
      network_fee: null,
      service_fee: null,
      quote_type: 'variable',
      quote_id: null,
      raw_response: '{}',
      success: 1,
      error_message: null,
      observed_at: now,
    });

    // 1. getLatestQuotes() deve conter as rotas ativas separadamente
    const latest = getLatestQuotes();
    const networks = latest.map((q) => q.destination_network);
    expect(networks).toContain('ethereum');
    expect(networks).toContain('solana');
    expect(networks).toContain('robinhood');

    // 2. getQuotesHistory isolado por rede
    const ethHistory = getQuotesHistory(24, { network: 'ethereum', asset: 'USDG' });
    expect(ethHistory.every(q => q.destination_network === 'ethereum' && q.destination_asset === 'USDG')).toBe(true);

    const arbitrumHistory = getQuotesHistory(24, { network: 'arbitrum', asset: 'USDC' });
    expect(arbitrumHistory.length).toBeGreaterThanOrEqual(1);
    expect(arbitrumHistory[0]!.destination_network).toBe('arbitrum');
    expect(arbitrumHistory[0]!.destination_asset).toBe('USDC');

    // 3. getRouteStats de USDG/Ethereum NÃO deve incluir as cotações antigas de USDC/Arbitrum
    const ethStats = getRouteStats('sideshift', 'ethereum', 'USDG');
    expect(ethStats.latest_quoted_amount).toBeCloseTo(192.46, 2);
    // A média não foi poluída com 188.50 de USDC/Arbitrum
    expect(ethStats.average_24h).toBeCloseTo(192.46, 2);
  });
});
