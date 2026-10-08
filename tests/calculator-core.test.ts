// tests/calculator-core.test.ts
// Testes do núcleo puro da Calculadora de Transação / Comparador de Cotações.
// Não acessa banco, API, rede nem DOM. Não importa código do monitor.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Os módulos do dashboard são JS puro (UMD: window.* no navegador, module.exports no Node).
// createRequire carrega-os como CommonJS nativo, sem dependências extras.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core: any = require('../src/dashboard/calculator-core.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const catalog: any = require('../src/dashboard/calculator-catalog.js');

const {
  parseAmount,
  calculateEffectiveRate,
  normalizeQuote,
  calculateReceivedForAmount,
  calculateDifference,
  rankQuotes,
  validateManualQuote,
  buildRouteKey,
  getProvidersForRoute,
  validateCatalog,
} = core;

// ------------------------------------------------------------------
// A) Exemplo obrigatório 350 → 66,54
// ------------------------------------------------------------------
describe('Exemplo real Puro Swap: 350 DEPIX → 66,54 USDG', () => {
  it('calcula a cotação efetiva sem perder precisão', () => {
    const rate = calculateEffectiveRate(350, 66.54);
    expect(rate).toBe(66.54 / 350);
    expect(rate).toBeCloseTo(0.1901142857, 10);
  });

  it('normaliza para 1.000 DEPIX ≈ 190,114 USDG', () => {
    const normalized = normalizeQuote(350, 66.54);
    expect(normalized).toBeCloseTo(190.1142857, 6);
    // Não arredonda internamente
    expect(normalized).not.toBe(190.11);
  });

  it('aceita as mesmas entradas em texto pt-BR', () => {
    expect(normalizeQuote('350,00', '66,54')).toBeCloseTo(190.1142857, 6);
    expect(calculateEffectiveRate('350', '66.54')).toBeCloseTo(0.1901142857, 10);
  });

  it('normaliza para outro alvo quando informado', () => {
    expect(normalizeQuote(350, 66.54, 500)).toBeCloseTo(95.05714285, 6);
    expect(normalizeQuote(350, 66.54, 0)).toBeNull();
    expect(normalizeQuote(350, 66.54, -1)).toBeNull();
  });
});

// ------------------------------------------------------------------
// E/F/G/H/I/J) parseAmount
// ------------------------------------------------------------------
describe('parseAmount', () => {
  it('aceita formatos obrigatórios', () => {
    expect(parseAmount('350')).toBe(350);
    expect(parseAmount('350,00')).toBe(350);
    expect(parseAmount('350.00')).toBe(350);
    expect(parseAmount(350)).toBe(350);
  });

  it('E) entrada com vírgula "66,54"', () => {
    expect(parseAmount('66,54')).toBe(66.54);
  });

  it('F) entrada com ponto "66.54"', () => {
    expect(parseAmount('66.54')).toBe(66.54);
  });

  it('aceita milhar com separadores', () => {
    expect(parseAmount('1.000,50')).toBe(1000.5);
    expect(parseAmount('1,000.50')).toBe(1000.5);
    expect(parseAmount('1.000.000')).toBe(1000000);
    expect(parseAmount(' 66,54 ')).toBe(66.54);
  });

  it('G) valores vazios retornam null', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('H) zero é interpretado (rejeição fica na validação)', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('0,00')).toBe(0);
    expect(parseAmount('-0')).toBe(0);
  });

  it('I) negativos são interpretados (rejeição fica na validação)', () => {
    expect(parseAmount('-5')).toBe(-5);
    expect(parseAmount('-66,54')).toBe(-66.54);
  });

  it('J) texto inválido retorna null', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12abc')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    expect(parseAmount('1.00,000.5')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount({})).toBeNull();
  });
});

// ------------------------------------------------------------------
// Proteções das funções de cálculo
// ------------------------------------------------------------------
describe('calculateEffectiveRate — entradas inválidas', () => {
  it('rejeita vazio, zero, negativo e texto', () => {
    expect(calculateEffectiveRate('', 66.54)).toBeNull();
    expect(calculateEffectiveRate(350, '')).toBeNull();
    expect(calculateEffectiveRate(0, 66.54)).toBeNull();
    expect(calculateEffectiveRate(350, 0)).toBeNull();
    expect(calculateEffectiveRate(-350, 66.54)).toBeNull();
    expect(calculateEffectiveRate(350, -66.54)).toBeNull();
    expect(calculateEffectiveRate('abc', 66.54)).toBeNull();
  });
});

// ------------------------------------------------------------------
// D) Valor real enviado
// ------------------------------------------------------------------
describe('calculateReceivedForAmount (valor REAL enviado)', () => {
  it('estima o recebido da SideShift para 350 DEPIX', () => {
    const sideshiftRate = 191.9 / 1000;
    expect(calculateReceivedForAmount(sideshiftRate, 350)).toBeCloseTo(67.165, 10);
  });

  it('reconstrói exatamente o valor manual informado', () => {
    const rate = calculateEffectiveRate(350, 66.54);
    expect(calculateReceivedForAmount(rate, 350)).toBeCloseTo(66.54, 10);
  });

  it('aceita texto pt-BR e rejeita inválidos', () => {
    expect(calculateReceivedForAmount('0,1919', '350,00')).toBeCloseTo(67.165, 10);
    expect(calculateReceivedForAmount(0.19, 0)).toBeNull();
    expect(calculateReceivedForAmount(0.19, -1)).toBeNull();
    expect(calculateReceivedForAmount(null, 350)).toBeNull();
    expect(calculateReceivedForAmount(0.19, 'xyz')).toBeNull();
  });
});

// ------------------------------------------------------------------
// K/L) Diferença absoluta e percentual
// ------------------------------------------------------------------
describe('calculateDifference', () => {
  it('K) diferença absoluta', () => {
    const diff = calculateDifference(190.1142857142857, 191.9);
    expect(diff.absolute).toBeCloseTo(-1.7857142857, 9);
  });

  it('L) diferença percentual', () => {
    const diff = calculateDifference(190.1142857142857, 191.9);
    expect(diff.percent).toBeCloseTo((-1.7857142857142858 / 191.9) * 100, 9);
    expect(diff.percent).toBeCloseTo(-0.930544, 5);
  });

  it('positiva quando o valor supera a referência', () => {
    const diff = calculateDifference(110, 100);
    expect(diff.absolute).toBe(10);
    expect(diff.percent).toBe(10);
  });

  it('zero quando iguais', () => {
    const diff = calculateDifference(191.9, 191.9);
    expect(diff.absolute).toBe(0);
    expect(diff.percent).toBe(0);
  });

  it('retorna null para referência inválida', () => {
    expect(calculateDifference(100, 0)).toBeNull();
    expect(calculateDifference(100, -5)).toBeNull();
    expect(calculateDifference(100, '')).toBeNull();
    expect(calculateDifference('abc', 100)).toBeNull();
  });
});

// ------------------------------------------------------------------
// B) Comparação entre duas cotações
// ------------------------------------------------------------------
describe('B) Comparação Puro Swap (manual) × SideShift (cache)', () => {
  const quotes = [
    { id: 'puroswap:xlayer', provider: 'puroswap', network: 'xlayer', mode: 'manual', sentAmount: 350, receivedAmount: 66.54 },
    { id: 'sideshift:solana', provider: 'sideshift', network: 'solana', mode: 'cached', effectiveRate: 191.9 / 1000 },
  ];

  it('elege a SideShift e calcula diferenças na base normalizada e no valor real', () => {
    const result = rankQuotes(quotes, { amount: 350 });

    expect(result.best.id).toBe('sideshift:solana');
    expect(result.hasTie).toBe(false);
    expect(result.ranked).toHaveLength(2);

    const [best, puro] = result.ranked;
    expect(best.normalizedReceived).toBeCloseTo(191.9, 10);
    expect(best.receivedForAmount).toBeCloseTo(67.165, 10);
    expect(best.differenceNormalized.absolute).toBe(0);

    expect(puro.normalizedReceived).toBeCloseTo(190.1142857, 6);
    expect(puro.receivedForAmount).toBeCloseTo(66.54, 10); // valor REAL preservado
    expect(puro.differenceNormalized.absolute).toBeCloseTo(-1.7857142857, 9);
    expect(puro.differenceNormalized.percent).toBeCloseTo(-0.930544, 5);
    expect(puro.differenceForAmount.absolute).toBeCloseTo(66.54 - 67.165, 10);
    expect(puro.rank).toBe(2);
    expect(puro.isBest).toBe(false);
  });

  it('preserva os metadados originais (provider, network, mode, observedAt)', () => {
    const withTime = [{ ...quotes[1], observedAt: '2026-10-08T12:50:00.000Z' }];
    const result = rankQuotes(withTime);
    expect(result.best.provider).toBe('sideshift');
    expect(result.best.network).toBe('solana');
    expect(result.best.mode).toBe('cached');
    expect(result.best.observedAt).toBe('2026-10-08T12:50:00.000Z');
  });

  it('sem amount informado, não calcula valores para o montante real', () => {
    const result = rankQuotes(quotes);
    expect(result.amount).toBeNull();
    expect(result.ranked[0].receivedForAmount).toBeNull();
    expect(result.ranked[0].differenceForAmount).toBeNull();
    expect(result.normalizeTo).toBe(1000);
  });
});

// ------------------------------------------------------------------
// C) Ranking de três ou mais cotações
// ------------------------------------------------------------------
describe('C) Ranking de múltiplas cotações', () => {
  it('ordena 4 rotas da maior para a menor', () => {
    const result = rankQuotes([
      { id: 'puroswap:xlayer', sentAmount: '350', receivedAmount: '66,54' },
      { id: 'sideshift:ethereum', effectiveRate: 0.19246 },
      { id: 'sideshift:solana', effectiveRate: 0.19315 },
      { id: 'sideshift:robinhood', effectiveRate: 0.19310 },
    ], { amount: '350,00' });

    expect(result.ranked.map((r: { id: string }) => r.id)).toEqual([
      'sideshift:solana',
      'sideshift:robinhood',
      'sideshift:ethereum',
      'puroswap:xlayer',
    ]);
    expect(result.ranked.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(result.amount).toBe(350);
  });

  it('separa cotações inválidas sem quebrar o ranking', () => {
    const result = rankQuotes([
      { id: 'a', effectiveRate: 0.19 },
      { id: 'sem-cotacao', effectiveRate: null },
      { id: 'zero', sentAmount: 350, receivedAmount: 0 },
      { id: 'b', effectiveRate: 0.191 },
    ]);
    expect(result.ranked.map((r: { id: string }) => r.id)).toEqual(['b', 'a']);
    expect(result.invalid.map((r: { id: string }) => r.id)).toEqual(['sem-cotacao', 'zero']);
  });

  it('lista vazia ou inválida retorna estado seguro', () => {
    for (const input of [[], null, undefined, 'x']) {
      const result = rankQuotes(input);
      expect(result.ranked).toEqual([]);
      expect(result.best).toBeNull();
      expect(result.hasTie).toBe(false);
    }
  });
});

// ------------------------------------------------------------------
// M) Empate
// ------------------------------------------------------------------
describe('M) Empate', () => {
  it('cotações iguais recebem o mesmo rank e ambas são melhores', () => {
    const result = rankQuotes([
      { id: 'b', effectiveRate: 0.19 },
      { id: 'a', sentAmount: 1000, receivedAmount: 190 },
      { id: 'c', effectiveRate: 0.18 },
    ]);
    expect(result.hasTie).toBe(true);
    expect(result.ranked.map((r: { rank: number }) => r.rank)).toEqual([1, 1, 3]);
    expect(result.ranked.filter((r: { isBest: boolean }) => r.isBest)).toHaveLength(2);
    expect(result.ranked[1].differenceNormalized.absolute).toBe(0);
  });
});

// ------------------------------------------------------------------
// N) Ranking determinístico
// ------------------------------------------------------------------
describe('N) Ranking determinístico', () => {
  const base = [
    { id: 'sideshift:solana', effectiveRate: 0.19 },
    { id: 'puroswap:xlayer', effectiveRate: 0.19 },
    { id: 'sideshift:ethereum', effectiveRate: 0.19 },
    { id: 'sideshift:robinhood', effectiveRate: 0.2 },
  ];

  it('empates são desempatados por id (asc), independente da ordem de entrada', () => {
    const expected = ['sideshift:robinhood', 'puroswap:xlayer', 'sideshift:ethereum', 'sideshift:solana'];
    const permutations = [
      base,
      [...base].reverse(),
      [base[2], base[0], base[3], base[1]],
    ];
    for (const p of permutations) {
      expect(rankQuotes(p).ranked.map((r: { id: string }) => r.id)).toEqual(expected);
    }
  });

  it('sem id, mantém a ordem original nos empates', () => {
    const result = rankQuotes([
      { label: 'primeiro', effectiveRate: 0.19 },
      { label: 'segundo', effectiveRate: 0.19 },
    ]);
    expect(result.ranked.map((r: { label: string }) => r.label)).toEqual(['primeiro', 'segundo']);
    expect(result.ranked.map((r: { originalIndex: number }) => r.originalIndex)).toEqual([0, 1]);
  });

  it('não altera o array de entrada', () => {
    const input = base.map((q) => ({ ...q }));
    const snapshot = JSON.stringify(input);
    rankQuotes(input, { amount: 350 });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ------------------------------------------------------------------
// validateManualQuote
// ------------------------------------------------------------------
describe('validateManualQuote', () => {
  it('aceita cotação manual válida', () => {
    const v = validateManualQuote({ sent: '350,00', received: '66,54' });
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.sentAmount).toBe(350);
    expect(v.receivedAmount).toBe(66.54);
    expect(v.effectiveRate).toBeCloseTo(0.1901142857, 10);
  });

  it('G) campos vazios → REQUIRED', () => {
    const v = validateManualQuote({ sent: '', received: '  ' });
    expect(v.valid).toBe(false);
    expect(v.errors.map((e: { field: string; code: string }) => `${e.field}:${e.code}`))
      .toEqual(['sent:REQUIRED', 'received:REQUIRED']);
    expect(v.effectiveRate).toBeNull();
  });

  it('H) zero → ZERO', () => {
    const v = validateManualQuote({ sent: '0', received: '66,54' });
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatchObject({ field: 'sent', code: 'ZERO' });
  });

  it('I) negativo → NEGATIVE', () => {
    const v = validateManualQuote({ sent: '350', received: '-66,54' });
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatchObject({ field: 'received', code: 'NEGATIVE' });
  });

  it('J) texto inválido → INVALID_NUMBER', () => {
    const v = validateManualQuote({ sent: 'abc', received: '66,54' });
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatchObject({ field: 'sent', code: 'INVALID_NUMBER' });
  });

  it('entrada ausente não lança exceção', () => {
    const v = validateManualQuote(undefined);
    expect(v.valid).toBe(false);
    expect(v.errors).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// Catálogo
// ------------------------------------------------------------------
describe('calculator-catalog', () => {
  it('é consistente internamente', () => {
    const result = validateCatalog(catalog);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('defaults conforme especificação', () => {
    expect(catalog.defaults).toMatchObject({
      sendAsset: 'DEPIX',
      sendNetwork: 'liquid',
      receiveAsset: 'USDG',
      receiveNetwork: 'xlayer',
      normalizeTo: 1000,
    });
  });

  it('v1 enxuta: apenas DEPIX→USDG e provedores SideShift/Puro Swap', () => {
    expect(Object.keys(catalog.assets)).toEqual(['DEPIX', 'USDG']);
    expect(catalog.send).toEqual([{ asset: 'DEPIX', networks: ['liquid'] }]);
    expect(Object.keys(catalog.providers)).toEqual(['sideshift', 'puroswap']);
  });

  it('redes de recebimento exatamente na ordem X Layer, Ethereum, Solana, Robinhood', () => {
    const usdg = catalog.receive.find((r: { asset: string }) => r.asset === 'USDG');
    expect(usdg.networks).toEqual(['xlayer', 'ethereum', 'solana', 'robinhood']);
    expect(usdg.networks.map((n: string) => catalog.networks[n].label))
      .toEqual(['X Layer', 'Ethereum', 'Solana', 'Robinhood']);
  });

  it('modos e rotas dos provedores', () => {
    const key = buildRouteKey('DEPIX', 'liquid', 'USDG');
    expect(key).toBe('DEPIX:liquid>USDG');
    expect(catalog.providers.sideshift.mode).toBe('cached');
    expect(catalog.providers.puroswap.mode).toBe('manual');
    expect(catalog.providers.sideshift.routes[key]).toEqual(['ethereum', 'solana', 'robinhood']);
    expect(catalog.providers.puroswap.routes[key]).toEqual(['xlayer']);
  });

  it('X Layer não é rota SideShift (somente Puro Swap manual)', () => {
    const forXLayer = getProvidersForRoute(catalog, 'DEPIX', 'liquid', 'USDG', 'xlayer');
    expect(forXLayer.map((p: { id: string }) => p.id)).toEqual(['puroswap']);
    const forSolana = getProvidersForRoute(catalog, 'DEPIX', 'liquid', 'USDG', 'solana');
    expect(forSolana.map((p: { id: string }) => p.id)).toEqual(['sideshift']);
    expect(getProvidersForRoute(catalog, 'BTC', 'bitcoin', 'USDG', 'solana')).toEqual([]);
  });

  it('é imutável (congelado)', () => {
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.providers.sideshift.routes)).toBe(true);
    expect(Object.isFrozen(catalog.receive[0].networks)).toBe(true);
  });

  it('validateCatalog detecta referências quebradas', () => {
    const broken = {
      assets: { DEPIX: {} },
      networks: { liquid: {} },
      send: [{ asset: 'DEPIX', networks: ['liquid'] }],
      receive: [{ asset: 'USDG', networks: ['xlayer'] }],
      providers: { x: { mode: 'auto', routes: { 'DEPIX:liquid>USDG': ['xlayer'] } } },
      defaults: { sendAsset: 'DEPIX', sendNetwork: 'liquid', receiveAsset: 'USDG', receiveNetwork: 'xlayer', normalizeTo: 0 },
    };
    const result = validateCatalog(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------
// Isolamento
// ------------------------------------------------------------------
describe('Isolamento do núcleo', () => {
  it('expõe API congelada e não depende de window no Node', () => {
    expect(Object.isFrozen(core)).toBe(true);
    expect(typeof (globalThis as Record<string, unknown>)['SwapCalculatorCore']).toBe('undefined');
  });
});
