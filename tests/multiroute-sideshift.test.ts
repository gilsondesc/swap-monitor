// tests/multiroute-sideshift.test.ts
// Testes unitários para múltiplas rotas SideShift (Ethereum, Solana, Robinhood)
import { describe, it, expect } from 'vitest';
import { parsePairResponse } from '../src/providers/sideshift/parser';
import { getMockSideShiftQuote } from '../src/mock/mock-provider';

describe('Multi-Route SideShift Parser', () => {
  it('parseia cotação real validada para Ethereum', () => {
    const rawEthereum = {
      min: '43.20152401',
      max: '152118.0423',
      rate: '0.192469103',
      depositCoin: 'DEPIX',
      settleCoin: 'USDG',
      depositNetwork: 'liquid',
      settleNetwork: 'ethereum',
    };

    const quote = parsePairResponse(rawEthereum, 1000, 'ethereum', 'USDG');
    expect(quote.success).toBe(true);
    expect(quote.depositCoin).toBe('DEPIX');
    expect(quote.depositNetwork).toBe('liquid');
    expect(quote.settleCoin).toBe('USDG');
    expect(quote.settleNetwork).toBe('ethereum');
    expect(quote.effectiveRate).toBeCloseTo(0.192469103, 8);
    // 1000 * 0.192469103 = 192.469103
    expect(quote.quotedAmount).toBeCloseTo(192.469103, 6);
    expect(quote.minimumAmount).toBeCloseTo(43.20152401, 6);
    expect(quote.maximumAmount).toBeCloseTo(152118.0423, 4);
  });

  it('parseia cotação real validada para Solana', () => {
    const rawSolana = {
      min: '50.7060141',
      max: '152118.0423',
      rate: '0.193154904',
      depositCoin: 'DEPIX',
      settleCoin: 'USDG',
      depositNetwork: 'liquid',
      settleNetwork: 'solana',
    };

    const quote = parsePairResponse(rawSolana, 1000, 'solana', 'USDG');
    expect(quote.success).toBe(true);
    expect(quote.settleNetwork).toBe('solana');
    expect(quote.effectiveRate).toBeCloseTo(0.193154904, 8);
    // 1000 * 0.193154904 = 193.154904
    expect(quote.quotedAmount).toBeCloseTo(193.154904, 6);
    expect(quote.minimumAmount).toBeCloseTo(50.7060141, 6);
  });

  it('parseia cotação real validada para Robinhood', () => {
    const rawRobinhood = {
      min: '152.1180423',
      max: '86529.75593165',
      rate: '0.193187394',
      depositCoin: 'DEPIX',
      settleCoin: 'USDG',
      depositNetwork: 'liquid',
      settleNetwork: 'robinhood',
    };

    const quote = parsePairResponse(rawRobinhood, 1000, 'robinhood', 'USDG');
    expect(quote.success).toBe(true);
    expect(quote.settleNetwork).toBe('robinhood');
    expect(quote.effectiveRate).toBeCloseTo(0.193187394, 8);
    // 1000 * 0.193187394 = 193.187394
    expect(quote.quotedAmount).toBeCloseTo(193.187394, 6);
    expect(quote.minimumAmount).toBeCloseTo(152.1180423, 6);
    expect(quote.maximumAmount).toBeCloseTo(86529.75593165, 4);
  });

  it('mantém a identidade da rota em caso de erro', () => {
    const rawError = { error: { message: 'Method USDG/robinhood not found' } };
    const quote = parsePairResponse(rawError, 1000, 'robinhood', 'USDG');

    expect(quote.success).toBe(false);
    expect(quote.settleNetwork).toBe('robinhood');
    expect(quote.settleCoin).toBe('USDG');
    expect(quote.error).toBe('Method USDG/robinhood not found');
    expect(quote.quotedAmount).toBeNull();
  });

  it('mock provider gera cotações válidas para as 3 redes', () => {
    const ethMock = getMockSideShiftQuote(1000, 'ethereum');
    const solMock = getMockSideShiftQuote(1000, 'solana');
    const robMock = getMockSideShiftQuote(1000, 'robinhood');

    expect(ethMock.settleNetwork).toBe('ethereum');
    expect(solMock.settleNetwork).toBe('solana');
    expect(robMock.settleNetwork).toBe('robinhood');

    expect(ethMock.quotedAmount).toBeGreaterThan(0);
    expect(solMock.quotedAmount).toBeGreaterThan(0);
    expect(robMock.quotedAmount).toBeGreaterThan(0);
  });
});
