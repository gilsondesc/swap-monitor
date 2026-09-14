// src/providers/sideshift/types.ts

export interface SideShiftPairResponse {
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  rate: string;
  min: string;
  max: string;
  depositCoinIsTokenized?: boolean;
  settleCoinIsTokenized?: boolean;
  // Campos adicionais que podem aparecer
  [key: string]: unknown;
}

export interface SideShiftQuoteResponse {
  id: string;
  createdAt: string;
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  depositAmount: string;
  settleAmount: string;
  rate: string;
  affiliateId?: string;
  expiresAt: string;
  type: 'fixed';
  networkFeeUsd?: string;
  [key: string]: unknown;
}

export interface SideShiftError {
  error: {
    message: string;
    [key: string]: unknown;
  };
}

export interface ParsedSideShiftQuote {
  provider: 'sideshift';
  success: boolean;
  error?: string;
  // Identificação do par
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  // Valores
  sourceAmount: number;
  quotedAmount: number | null;
  effectiveRate: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  networkFee: number | null;
  serviceFee: number | null;
  quoteType: string | null;
  quoteId: string | null;
  // Metadados
  rawResponse: string;
  observedAt: string;
}
