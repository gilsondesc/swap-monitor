// src/services/scoring.service.ts

export interface ScoreResult {
  score: number;
  label: string;
  emoji: string;
  description: string;
}

/**
 * Calcula score de oportunidade (0–100) com base em comparação estatística.
 *
 * AVISO: Este score é apenas um indicador estatístico baseado no histórico
 * coletado. NÃO representa rentabilidade garantida.
 *
 * Critérios:
 * - Compara quotedAmount vs média 1h (peso 30%)
 * - Compara quotedAmount vs média 6h (peso 30%)
 * - Compara quotedAmount vs média 24h (peso 20%)
 * - Compara quotedAmount vs melhor 24h (peso 20%)
 */
export function calculateScore(
  quotedAmount: number,
  average1h: number | null,
  average6h: number | null,
  average24h: number | null,
  best24h: number | null,
): ScoreResult {
  // Sem histórico suficiente
  if (average1h === null && average6h === null && average24h === null) {
    return {
      score: 50,
      label: 'Normal',
      emoji: '🟡',
      description: 'Histórico insuficiente para pontuação',
    };
  }

  let totalWeight = 0;
  let weightedScore = 0;

  // Função auxiliar: quanto % acima/abaixo da referência
  function componentScore(current: number, reference: number): number {
    const diff = (current - reference) / reference;
    // Mapeia -2% → 0, 0% → 50, +2% → 100
    const raw = 50 + diff * 2500;
    return Math.max(0, Math.min(100, raw));
  }

  if (average1h !== null) {
    weightedScore += componentScore(quotedAmount, average1h) * 30;
    totalWeight += 30;
  }
  if (average6h !== null) {
    weightedScore += componentScore(quotedAmount, average6h) * 30;
    totalWeight += 30;
  }
  if (average24h !== null) {
    weightedScore += componentScore(quotedAmount, average24h) * 20;
    totalWeight += 20;
  }
  if (best24h !== null) {
    weightedScore += componentScore(quotedAmount, best24h) * 20;
    totalWeight += 20;
  }

  const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
  return classifyScore(Math.max(0, Math.min(100, score)));
}

function classifyScore(score: number): ScoreResult {
  if (score <= 30) {
    return { score, label: 'Muito ruim',  emoji: '🔴',    description: 'Cotação significativamente abaixo da média histórica' };
  } else if (score <= 45) {
    return { score, label: 'Ruim',        emoji: '🟠',    description: 'Cotação abaixo da média histórica' };
  } else if (score <= 60) {
    return { score, label: 'Normal',      emoji: '🟡',    description: 'Cotação próxima da média histórica' };
  } else if (score <= 80) {
    return { score, label: 'Boa',         emoji: '🟢',    description: 'Boa oportunidade em relação ao histórico' };
  } else {
    return { score, label: 'Excelente',   emoji: '🟢🟢', description: 'Excelente oportunidade — próxima do melhor valor histórico' };
  }
}
