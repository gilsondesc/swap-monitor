// src/services/statistics.service.ts
import { getQuotesHistory } from '../database/db';

export interface ProviderStats {
  provider: string;
  count: number;
  average_1h: number | null;
  average_6h: number | null;
  average_24h: number | null;
  best_1h: number | null;
  best_6h: number | null;
  best_24h: number | null;
  worst_1h: number | null;
  worst_6h: number | null;
  worst_24h: number | null;
  difference_vs_average_24h: number | null;
  difference_vs_best_24h: number | null;
  latest_quoted_amount: number | null;
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function best(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.max(...arr);
}

function worst(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.min(...arr);
}

function pctDiff(current: number, reference: number): number | null {
  if (!current || !reference || reference === 0) return null;
  return parseFloat((((current - reference) / reference) * 100).toFixed(4));
}

export function getProviderStats(provider: string): ProviderStats {
  const h1  = getQuotesHistory(1, provider).map((r) => r.quoted_amount).filter((v): v is number => v !== null);
  const h6  = getQuotesHistory(6, provider).map((r) => r.quoted_amount).filter((v): v is number => v !== null);
  const h24 = getQuotesHistory(24, provider).map((r) => r.quoted_amount).filter((v): v is number => v !== null);

  const latest = h1[0] ?? h6[0] ?? h24[0] ?? null;

  const avg24 = average(h24);
  const best24 = best(h24);

  return {
    provider,
    count: h24.length,
    average_1h:  average(h1),
    average_6h:  average(h6),
    average_24h: avg24,
    best_1h:  best(h1),
    best_6h:  best(h6),
    best_24h: best24,
    worst_1h:  worst(h1),
    worst_6h:  worst(h6),
    worst_24h: worst(h24),
    difference_vs_average_24h: latest !== null && avg24 !== null ? pctDiff(latest, avg24) : null,
    difference_vs_best_24h:    latest !== null && best24 !== null ? pctDiff(latest, best24) : null,
    latest_quoted_amount: latest,
  };
}

export function getAllProvidersStats(providers: string[]): ProviderStats[] {
  return providers.map(getProviderStats);
}
