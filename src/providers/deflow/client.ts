// src/providers/deflow/client.ts
import type { ParsedDeFlowQuote } from './types';
import { config } from '../../config/config';

const PROVIDER = 'DeFlow';

/**
 * Cliente DeFlow — SWAP SUSPENSA TEMPORARIAMENTE
 *
 * A funcionalidade de Swap da DeFlow está suspensa.
 * Este provider retornará status 'suspended' até que o serviço seja reativado.
 *
 * Para reativar quando o serviço voltar:
 * 1. Identificar endpoints da API DeFlow para o par DEPIX/Liquid → USDG/Arbitrum
 * 2. Implementar a lógica em src/providers/deflow/client.ts
 * 3. Implementar o parser em src/providers/deflow/parser.ts
 * 4. Configurar DEFLOW_ENABLED=true e DEFLOW_API_BASE_URL no .env
 *
 * Veja também: src/providers/deflow/types.ts para detalhes
 */
export async function fetchDeFlowQuote(amount: number): Promise<ParsedDeFlowQuote> {
  if (!config.deflow.enabled) {
    console.log(`[${PROVIDER}] desabilitado (DEFLOW_ENABLED=false)`);
    return {
      provider: 'deflow',
      success: false,
      status: 'disabled',
      error: 'DeFlow desabilitado. Configure DEFLOW_ENABLED=true após a reativação do serviço.',
      sourceAmount: amount,
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

  // Swap suspensa: retorna suspended mesmo se DEFLOW_ENABLED=true
  console.warn(`[${PROVIDER}] swap suspensa temporariamente — aguardando reativação do serviço`);
  return {
    provider: 'deflow',
    success: false,
    status: 'suspended',
    error: 'Swap DeFlow suspensa temporariamente. Aguardando reativação do serviço.',
    sourceAmount: amount,
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
