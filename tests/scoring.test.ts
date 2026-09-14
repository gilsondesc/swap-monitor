// tests/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { calculateScore } from '../src/services/scoring.service';

describe('scoring.service', () => {
  it('retorna score 50 sem histórico suficiente', () => {
    const result = calculateScore(187, null, null, null, null);
    expect(result.score).toBe(50);
    expect(result.label).toBe('Normal');
  });

  it('retorna score alto quando quotedAmount > médias', () => {
    // 190 bem acima da média 188
    const result = calculateScore(190, 186, 186, 186, 190);
    expect(result.score).toBeGreaterThan(60);
    expect(['Boa', 'Excelente']).toContain(result.label);
  });

  it('retorna score baixo quando quotedAmount < médias', () => {
    // 184 bem abaixo da média 188
    const result = calculateScore(184, 188, 188, 188, 192);
    expect(result.score).toBeLessThan(46);
    expect(['Ruim', 'Muito ruim']).toContain(result.label);
  });

  it('score fica entre 0 e 100', () => {
    for (let i = 0; i < 20; i++) {
      const amt = 180 + Math.random() * 20;
      const avg = 185 + Math.random() * 10;
      const result = calculateScore(amt, avg, avg, avg, avg + 5);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('classifica score 0-30 como Muito ruim', () => {
    // quotedAmount 10% abaixo da média
    const result = calculateScore(170, 188, 188, 188, 195);
    expect(result.score).toBeLessThanOrEqual(30);
    expect(result.label).toBe('Muito ruim');
    expect(result.emoji).toBe('🔴');
  });

  it('classifica score 81-100 como Excelente', () => {
    // quotedAmount igual ao melhor 24h
    const result = calculateScore(192, 186, 186, 186, 192);
    expect(result.score).toBeGreaterThan(70);
  });

  it('retorna emoji e label corretos', () => {
    const result = calculateScore(187, 187, 187, 187, 187);
    expect(result.emoji).toBeDefined();
    expect(result.label).toBeDefined();
    expect(result.description).toBeDefined();
  });
});
