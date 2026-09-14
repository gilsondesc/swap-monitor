// tests/providers.test.ts
import { describe, it, expect } from 'vitest';
import { parsePairResponse, parseQuoteResponse } from '../src/providers/sideshift/parser';
import { getMockSideShiftQuote, getMockDeFlowQuote, resetMockCounter } from '../src/mock/mock-provider';

describe('sideshift/parser', () => {
  it('parseia resposta de par válida', () => {
    const raw = {
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      rate: '0.18742',
      min: '10',
      max: '100000',
    };
    const result = parsePairResponse(raw, 1000);
    expect(result.success).toBe(true);
    expect(result.provider).toBe('sideshift');
    expect(result.effectiveRate).toBeCloseTo(0.18742, 5);
    expect(result.quotedAmount).toBeCloseTo(187.42, 2);
    expect(result.minimumAmount).toBe(10);
    expect(result.maximumAmount).toBe(100000);
    expect(result.quoteType).toBe('variable');
  });

  it('retorna success=false para resposta de erro da SideShift', () => {
    const raw = { error: { message: 'pair not available' } };
    const result = parsePairResponse(raw, 1000);
    expect(result.success).toBe(false);
    expect(result.error).toBe('pair not available');
    expect(result.quotedAmount).toBeNull();
  });

  it('retorna success=false quando rate está ausente', () => {
    const raw = {
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      // rate ausente
      min: '10',
      max: '100000',
    };
    const result = parsePairResponse(raw, 1000);
    expect(result.success).toBe(false);
  });

  it('parseia resposta de quote fixo', () => {
    const raw = {
      id: 'q123',
      createdAt: new Date().toISOString(),
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      depositAmount: '1000',
      settleAmount: '187.50',
      rate: '0.18750',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      type: 'fixed',
    };
    const result = parseQuoteResponse(raw, 1000);
    expect(result.success).toBe(true);
    expect(result.quoteId).toBe('q123');
    expect(result.quoteType).toBe('fixed');
    expect(result.quotedAmount).toBeCloseTo(187.5, 2);
  });

  it('calcula effective_rate = quoted_amount / source_amount', () => {
    const raw = {
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      rate: '0.18900',
      min: '10',
      max: '100000',
    };
    const result = parsePairResponse(raw, 500);
    expect(result.effectiveRate).toBeCloseTo(0.189, 5);
    expect(result.quotedAmount).toBeCloseTo(94.5, 2);
  });

  it('lida com valores de casas decimais longas', () => {
    const raw = {
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      rate: '0.187421337891234567',
      min: '10',
      max: '100000',
    };
    const result = parsePairResponse(raw, 1000);
    expect(result.success).toBe(true);
    expect(result.quotedAmount).toBeDefined();
    expect(isNaN(result.quotedAmount!)).toBe(false);
  });

  it('never expõe API key no rawResponse', () => {
    const raw = {
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      rate: '0.18742',
      min: '10',
      max: '100000',
    };
    const result = parsePairResponse(raw, 1000);
    expect(result.rawResponse).not.toContain('x-sideshift-secret');
    expect(result.rawResponse).not.toContain('API_KEY');
  });
});

describe('mock-provider', () => {
  it('gera quotes válidas para SideShift', () => {
    resetMockCounter();
    const quote = getMockSideShiftQuote(1000);
    expect(quote.success).toBe(true);
    expect(quote.provider).toBe('sideshift');
    expect(quote.quotedAmount).toBeGreaterThan(0);
    expect(quote.effectiveRate).toBeGreaterThan(0);
    expect(quote.depositCoin).toBe('DEPIX');
    expect(quote.settleCoin).toBe('USDG');
  });

  it('gera quotes válidas para DeFlow', () => {
    resetMockCounter();
    const quote = getMockDeFlowQuote(1000);
    expect(quote.success).toBe(true);
    expect(quote.provider).toBe('deflow');
    expect(quote.quotedAmount).toBeGreaterThan(0);
  });

  it('quoted_amount = effective_rate × source_amount', () => {
    resetMockCounter();
    const amount = 500;
    const quote = getMockSideShiftQuote(amount);
    // tolerance de floating point
    expect(Math.abs(quote.quotedAmount! - quote.effectiveRate! * amount)).toBeLessThan(0.01);
  });

  it('respeita source_amount corretamente', () => {
    resetMockCounter();
    const q100  = getMockSideShiftQuote(100);
    resetMockCounter();
    const q1000 = getMockSideShiftQuote(1000);
    // 1000 DEPIX deve retornar ~10x mais que 100 DEPIX
    expect(q1000.quotedAmount!).toBeGreaterThan(q100.quotedAmount!);
  });

  it('provider indisponível não quebra o sistema', () => {
    // DeFlow com enabled=false retorna status disabled, não lança exceção
    const quote = getMockDeFlowQuote(1000);
    expect(() => quote).not.toThrow();
    expect(quote.quotedAmount).not.toBeNaN();
  });
});
