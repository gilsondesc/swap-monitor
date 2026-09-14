// tests/comparison.test.ts
import { describe, it, expect } from 'vitest';
import { compareBestProvider } from '../src/services/comparison.service';
import type { ProviderStats } from '../src/services/statistics.service';

function makeStats(provider: string, amount: number | null): ProviderStats {
  return {
    provider,
    count: amount != null ? 5 : 0,
    average_1h:  amount,
    average_6h:  amount,
    average_24h: amount,
    best_1h:     amount,
    best_6h:     amount,
    best_24h:    amount,
    worst_1h:    amount,
    worst_6h:    amount,
    worst_24h:   amount,
    difference_vs_average_24h: null,
    difference_vs_best_24h:    null,
    latest_quoted_amount: amount,
  };
}

describe('comparison.service', () => {
  it('retorna null quando nenhum provider tem cotação', () => {
    const result = compareBestProvider([
      makeStats('sideshift', null),
      makeStats('deflow', null),
    ]);
    expect(result.best_provider).toBeNull();
  });

  it('retorna o único provider quando só um tem cotação', () => {
    const result = compareBestProvider([
      makeStats('sideshift', 187.5),
      makeStats('deflow', null),
    ]);
    expect(result.best_provider).toBe('sideshift');
    expect(result.second_provider).toBeNull();
  });

  it('escolhe o provider com maior quoted_amount', () => {
    const result = compareBestProvider([
      makeStats('sideshift', 187.42),
      makeStats('deflow', 188.17),
    ]);
    expect(result.best_provider).toBe('deflow');
    expect(result.best_quoted_amount).toBe(188.17);
    expect(result.second_provider).toBe('sideshift');
  });

  it('calcula diferença percentual corretamente', () => {
    // DeFlow: 188.17, SideShift: 187.42
    // diff% = (188.17 - 187.42) / 187.42 * 100 ≈ 0.40%
    const result = compareBestProvider([
      makeStats('sideshift', 187.42),
      makeStats('deflow', 188.17),
    ]);
    expect(result.provider_difference_pct).not.toBeNull();
    expect(result.provider_difference_pct!).toBeCloseTo(0.40, 1);
  });

  it('label indica o melhor provider', () => {
    const result = compareBestProvider([
      makeStats('sideshift', 187.42),
      makeStats('deflow', 188.17),
    ]);
    expect(result.provider_difference_label).toContain('deflow');
    expect(result.provider_difference_label).toContain('+');
  });

  it('NÃO compara apenas o rate — usa quoted_amount final', () => {
    // Ambos com mesmo source_amount 1000, mas quoted_amount diferentes
    const result = compareBestProvider([
      makeStats('sideshift', 190.00),
      makeStats('deflow', 189.50),
    ]);
    // SideShift entrega mais USDG → é o melhor
    expect(result.best_provider).toBe('sideshift');
  });

  it('lida com valores zero', () => {
    const result = compareBestProvider([
      makeStats('sideshift', 0),
      makeStats('deflow', 0),
    ]);
    // Sem quote válido (0 é filtrado)
    expect(result.best_provider).toBeNull();
  });
});
