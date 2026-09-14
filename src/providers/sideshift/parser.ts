// src/providers/sideshift/parser.ts
import type {
  SideShiftPairResponse,
  SideShiftQuoteResponse,
  SideShiftError,
  ParsedSideShiftQuote,
} from './types';

function isSideShiftError(data: unknown): data is SideShiftError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as SideShiftError).error === 'object'
  );
}

function safeNum(val: string | undefined | null): number | null {
  if (val == null || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/**
 * Parseia resposta do endpoint GET /v2/pair/:from/:to
 * Retorna cotação variável (sem quote_id).
 */
export function parsePairResponse(
  raw: unknown,
  sourceAmount: number,
): ParsedSideShiftQuote {
  const observedAt = new Date().toISOString();

  // Serializa sem secrets
  const rawResponse = JSON.stringify(raw);

  if (isSideShiftError(raw)) {
    return {
      provider: 'sideshift',
      success: false,
      error: raw.error.message ?? 'Erro desconhecido da SideShift',
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      sourceAmount,
      quotedAmount: null,
      effectiveRate: null,
      minimumAmount: null,
      maximumAmount: null,
      networkFee: null,
      serviceFee: null,
      quoteType: 'variable',
      quoteId: null,
      rawResponse,
      observedAt,
    };
  }

  const data = raw as SideShiftPairResponse;
  const rate = safeNum(data.rate);
  const quotedAmount = rate !== null ? parseFloat((rate * sourceAmount).toFixed(8)) : null;

  return {
    provider: 'sideshift',
    success: rate !== null,
    error: rate === null ? 'Rate não disponível na resposta' : undefined,
    depositCoin: data.depositCoin ?? 'DEPIX',
    depositNetwork: data.depositNetwork ?? 'liquid',
    settleCoin: data.settleCoin ?? 'USDG',
    settleNetwork: data.settleNetwork ?? 'arbitrum',
    sourceAmount,
    quotedAmount,
    effectiveRate: rate,
    minimumAmount: safeNum(data.min),
    maximumAmount: safeNum(data.max),
    networkFee: null, // não retornado no par simples
    serviceFee: null,
    quoteType: 'variable',
    quoteId: null,
    rawResponse,
    observedAt,
  };
}

/**
 * Parseia resposta do endpoint POST /v2/quotes
 * Retorna cotação fixa (com quote_id e validade).
 */
export function parseQuoteResponse(
  raw: unknown,
  sourceAmount: number,
): ParsedSideShiftQuote {
  const observedAt = new Date().toISOString();
  const rawResponse = JSON.stringify(raw);

  if (isSideShiftError(raw)) {
    return {
      provider: 'sideshift',
      success: false,
      error: raw.error.message ?? 'Erro desconhecido da SideShift',
      depositCoin: 'DEPIX',
      depositNetwork: 'liquid',
      settleCoin: 'USDG',
      settleNetwork: 'arbitrum',
      sourceAmount,
      quotedAmount: null,
      effectiveRate: null,
      minimumAmount: null,
      maximumAmount: null,
      networkFee: null,
      serviceFee: null,
      quoteType: 'fixed',
      quoteId: null,
      rawResponse,
      observedAt,
    };
  }

  const data = raw as SideShiftQuoteResponse;
  const settleAmount = safeNum(data.settleAmount);
  const rate = safeNum(data.rate);
  const networkFeeUsd = safeNum(data.networkFeeUsd ?? null);

  return {
    provider: 'sideshift',
    success: settleAmount !== null,
    error: settleAmount === null ? 'settleAmount não disponível' : undefined,
    depositCoin: data.depositCoin ?? 'DEPIX',
    depositNetwork: data.depositNetwork ?? 'liquid',
    settleCoin: data.settleCoin ?? 'USDG',
    settleNetwork: data.settleNetwork ?? 'arbitrum',
    sourceAmount,
    quotedAmount: settleAmount,
    effectiveRate: rate ?? (settleAmount !== null ? settleAmount / sourceAmount : null),
    minimumAmount: null,
    maximumAmount: null,
    networkFee: networkFeeUsd,
    serviceFee: null,
    quoteType: 'fixed',
    quoteId: data.id ?? null,
    rawResponse,
    observedAt,
  };
}
