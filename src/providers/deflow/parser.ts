// src/providers/deflow/parser.ts
import type { ParsedDeFlowQuote } from './types';

/**
 * Parser DeFlow — PENDENTE DE VALIDAÇÃO
 *
 * Este arquivo será implementado quando a API DeFlow for identificada.
 * Por enquanto retorna status pending_validation.
 */
export function parseDeFlowResponse(
  _raw: unknown,
  sourceAmount: number,
): ParsedDeFlowQuote {
  return {
    provider: 'deflow',
    success: false,
    status: 'pending_validation',
    error: 'Integração DeFlow pendente de validação',
    sourceAmount,
    quotedAmount: null,
    effectiveRate: null,
    minimumAmount: null,
    maximumAmount: null,
    networkFee: null,
    serviceFee: null,
    quoteType: null,
    quoteId: null,
    rawResponse: '{}',
    observedAt: new Date().toISOString(),
  };
}
