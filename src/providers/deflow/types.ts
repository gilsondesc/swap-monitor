// src/providers/deflow/types.ts

/**
 * STATUS DE INTEGRAÇÃO DEFLOW
 * ============================================================
 * Status atual: SUSPENDED
 *
 * A funcionalidade de Swap da DeFlow está SUSPENSA temporariamente.
 * Nenhuma cotação pode ser obtida no momento.
 *
 * Quando a DeFlow reativar o serviço, será necessário:
 * 1. Identificar o endpoint público de cotação (GET ou POST /quote)
 * 2. Confirmar identificador do ativo DEPIX na rede Liquid
 * 3. Confirmar identificador do ativo USDG na rede Arbitrum
 * 4. Confirmar modelo de autenticação
 * 5. Implementar src/providers/deflow/client.ts e parser.ts
 * 6. Atualizar DEFLOW_API_BASE_URL e DEFLOW_API_KEY no .env
 * 7. Setar DEFLOW_ENABLED=true no .env
 * ============================================================
 */

export interface DeFlowQuoteRequest {
  sourceAsset: string;
  sourceNetwork: string;
  destinationAsset: string;
  destinationNetwork: string;
  sourceAmount: number;
}

export interface DeFlowQuoteResponse {
  // Campos a serem confirmados após reativação do serviço
  [key: string]: unknown;
}

export interface ParsedDeFlowQuote {
  provider: 'deflow';
  success: boolean;
  status: 'suspended' | 'pending_validation' | 'ok' | 'error' | 'disabled';
  error?: string;
  sourceAmount: number;
  quotedAmount: number | null;
  effectiveRate: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  networkFee: number | null;
  serviceFee: number | null;
  quoteType: string | null;
  quoteId: string | null;
  rawResponse: string;
  observedAt: string;
}
