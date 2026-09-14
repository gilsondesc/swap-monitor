// src/mock/mock-provider.ts
// Gera cotações simuladas realistas para testes sem APIs reais

import type { ParsedSideShiftQuote } from '../providers/sideshift/types';
import type { ParsedDeFlowQuote } from '../providers/deflow/types';

// Valores base realistas (aproximação DEPIX/BRL → USDG/USD)
const SIDESHIFT_BASE = 187.20;
const DEFLOW_BASE = 187.80;

// Variação máxima por consulta (simula flutuação de mercado)
const VARIATION = 0.005; // ±0.5%

function randomVariation(base: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * VARIATION;
  return parseFloat((base * factor).toFixed(8));
}

let callCount = 0;

// Sequências fixas para reprodutibilidade nos testes
const SIDESHIFT_SEQUENCE = [187.10, 187.30, 187.42, 186.90, 187.85, 187.20, 188.01, 186.75];
const DEFLOW_SEQUENCE    = [187.80, 188.10, 187.50, 188.20, 187.60, 188.35, 187.90, 188.50];

export function getMockSideShiftQuote(amount: number): ParsedSideShiftQuote {
  const idx = callCount % SIDESHIFT_SEQUENCE.length;
  const baseRate = SIDESHIFT_SEQUENCE[idx]! / 1000; // rate por DEPIX
  const rate = randomVariation(baseRate);
  const quotedAmount = parseFloat((rate * amount).toFixed(8));

  return {
    provider: 'sideshift',
    success: true,
    depositCoin: 'DEPIX',
    depositNetwork: 'liquid',
    settleCoin: 'USDG',
    settleNetwork: 'arbitrum',
    sourceAmount: amount,
    quotedAmount,
    effectiveRate: rate,
    minimumAmount: 10,
    maximumAmount: 100000,
    networkFee: null,
    serviceFee: null,
    quoteType: 'variable',
    quoteId: null,
    rawResponse: JSON.stringify({
      mock: true,
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      rate: String(rate),
      min: '10',
      max: '100000',
    }),
    observedAt: new Date().toISOString(),
  };
}

export function getMockDeFlowQuote(amount: number): ParsedDeFlowQuote {
  const idx = callCount % DEFLOW_SEQUENCE.length;
  const baseRate = DEFLOW_SEQUENCE[idx]! / 1000;
  const rate = randomVariation(baseRate);
  const quotedAmount = parseFloat((rate * amount).toFixed(8));

  callCount++;

  return {
    provider: 'deflow',
    success: true,
    status: 'ok',
    sourceAmount: amount,
    quotedAmount,
    effectiveRate: rate,
    minimumAmount: 50,
    maximumAmount: 500000,
    networkFee: null,
    serviceFee: null,
    quoteType: 'variable',
    quoteId: null,
    rawResponse: JSON.stringify({
      mock: true,
      rate: String(rate),
      quotedAmount: String(quotedAmount),
    }),
    observedAt: new Date().toISOString(),
  };
}

/** Reseta contador (útil para testes) */
export function resetMockCounter(): void {
  callCount = 0;
}
