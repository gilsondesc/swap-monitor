// src/services/comparison.service.ts
import type { ProviderStats } from './statistics.service';

export interface ComparisonResult {
  best_provider: string | null;
  best_quoted_amount: number | null;
  second_provider: string | null;
  second_quoted_amount: number | null;
  provider_difference_abs: number | null;
  provider_difference_pct: number | null;
  provider_difference_label: string | null;
  note: string;
}

/**
 * Determina o melhor provedor com base no quoted_amount FINAL
 * para exatamente o mesmo source_amount.
 *
 * Regra: "Qual provedor entrega mais USDG para o mesmo número de DEPIX?"
 * NÃO compara apenas o rate nominal.
 */
export function compareBestProvider(stats: ProviderStats[]): ComparisonResult {
  // Filtra apenas providers com cotação válida
  const available = stats.filter(
    (s) => s.latest_quoted_amount !== null && s.latest_quoted_amount > 0,
  );

  if (available.length === 0) {
    return {
      best_provider: null,
      best_quoted_amount: null,
      second_provider: null,
      second_quoted_amount: null,
      provider_difference_abs: null,
      provider_difference_pct: null,
      provider_difference_label: null,
      note: 'Nenhum provedor disponível com cotação válida',
    };
  }

  if (available.length === 1) {
    const only = available[0]!;
    return {
      best_provider: only.provider,
      best_quoted_amount: only.latest_quoted_amount,
      second_provider: null,
      second_quoted_amount: null,
      provider_difference_abs: null,
      provider_difference_pct: null,
      provider_difference_label: null,
      note: 'Apenas um provedor com cotação disponível',
    };
  }

  // Ordena por quoted_amount decrescente (mais USDG = melhor)
  const sorted = [...available].sort(
    (a, b) => (b.latest_quoted_amount ?? 0) - (a.latest_quoted_amount ?? 0),
  );

  const first = sorted[0]!;
  const second = sorted[1]!;

  const diffAbs = (first.latest_quoted_amount ?? 0) - (second.latest_quoted_amount ?? 0);
  const diffPct = second.latest_quoted_amount && second.latest_quoted_amount > 0
    ? parseFloat(((diffAbs / second.latest_quoted_amount) * 100).toFixed(4))
    : null;

  const label = diffPct !== null
    ? `+${diffPct.toFixed(2)}% ${first.provider}`
    : null;

  return {
    best_provider: first.provider,
    best_quoted_amount: first.latest_quoted_amount,
    second_provider: second.provider,
    second_quoted_amount: second.latest_quoted_amount,
    provider_difference_abs: parseFloat(diffAbs.toFixed(8)),
    provider_difference_pct: diffPct,
    provider_difference_label: label,
    note: `${first.provider} entrega mais USDG para o mesmo valor de DEPIX`,
  };
}
