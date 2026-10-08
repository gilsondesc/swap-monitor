// tests/calculator-integration.test.ts
// Testes de integração READ-ONLY da Calculadora (Etapa 3A)
// Valida os requisitos A até J:
//   A. cálculo manual continua funcionando;
//   B. cotação SideShift é interpretada corretamente;
//   C. três redes podem ser carregadas;
//   D. uma rede indisponível não quebra as demais;
//   E. fallback funciona quando latest falha ou não tem cotação;
//   F. ranking mistura corretamente Puro Swap + SideShift;
//   G. diferença absoluta e percentual estão corretas;
//   H. falha da API não impede cálculo manual;
//   I. nenhuma chamada POST/PUT/PATCH/DELETE é realizada;
//   J. nenhum dado é persistido.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core: any = require('../src/dashboard/calculator-core.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calculator: any = require('../src/dashboard/calculator.js');

const { loadSideShiftQuotes, buildQuotesForRanking, SIDESHIFT_NETWORKS } = calculator;

describe('Etapa 3A — Integração READ-ONLY de Cotações da Calculadora', () => {

  // A. Cálculo manual continua funcionando
  it('A. cálculo manual continua funcionando perfeitamente (350 DEPIX → 66,54 USDG)', () => {
    const v = core.validateManualQuote({ sent: '350,00', received: '66,54' });
    expect(v.valid).toBe(true);
    expect(v.sentAmount).toBe(350);
    expect(v.receivedAmount).toBe(66.54);
    const rate = core.calculateEffectiveRate(v.sentAmount, v.receivedAmount);
    expect(rate).toBeCloseTo(0.1901142857, 10);
    const norm = core.normalizeQuote(v.sentAmount, v.receivedAmount, 1000);
    expect(norm).toBeCloseTo(190.1142857, 6);
  });

  // B. Cotação SideShift é interpretada corretamente a partir da API
  it('B. cotação SideShift é interpretada corretamente a partir de /api/quotes/latest', async () => {
    const mockFetch = async (url: string) => {
      expect(url).toBe('/api/quotes/latest');
      return {
        ok: true,
        json: async () => ({
          quotes: [
            {
              provider: 'sideshift',
              destination_network: 'ethereum',
              source_amount: 1000,
              quoted_amount: 191.50,
              effective_rate: 0.19150,
              observed_at: '2026-10-08T12:00:00.000Z',
              success: 1,
            },
          ],
        }),
      };
    };

    const quotes = await loadSideShiftQuotes(mockFetch);
    const eth = quotes['ethereum'];
    expect(eth.status).toBe('online');
    expect(eth.quotedAmount).toBe(191.50);
    expect(eth.effectiveRate).toBe(0.19150);
    expect(eth.sourceAmount).toBe(1000);
    expect(eth.observedAt).toBe('2026-10-08T12:00:00.000Z');
  });

  // C. Três redes podem ser carregadas
  it('C. três redes (ethereum, solana, robinhood) podem ser carregadas', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        quotes: [
          { provider: 'sideshift', destination_network: 'ethereum', quoted_amount: 191.20, effective_rate: 0.19120, success: 1, observed_at: '2026-10-08T12:00:00.000Z' },
          { provider: 'sideshift', destination_network: 'solana', quoted_amount: 193.15, effective_rate: 0.19315, success: 1, observed_at: '2026-10-08T12:00:01.000Z' },
          { provider: 'sideshift', destination_network: 'robinhood', quoted_amount: 192.80, effective_rate: 0.19280, success: 1, observed_at: '2026-10-08T12:00:02.000Z' },
        ],
      }),
    });

    const quotes = await loadSideShiftQuotes(mockFetch);
    expect(Object.keys(quotes)).toEqual(SIDESHIFT_NETWORKS);
    expect(quotes['ethereum'].status).toBe('online');
    expect(quotes['solana'].status).toBe('online');
    expect(quotes['robinhood'].status).toBe('online');
    expect(quotes['solana'].quotedAmount).toBe(193.15);
  });

  // D. Uma rede indisponível não quebra as demais
  it('D. uma rede indisponível não quebra as demais', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/api/quotes/latest')) {
        return {
          ok: true,
          json: async () => ({
            quotes: [
              { provider: 'sideshift', destination_network: 'ethereum', quoted_amount: 191.20, effective_rate: 0.19120, success: 1 },
              { provider: 'sideshift', destination_network: 'solana', quoted_amount: null, effective_rate: null, success: 0 }, // solana com falha
              { provider: 'sideshift', destination_network: 'robinhood', quoted_amount: 192.80, effective_rate: 0.19280, success: 1 },
            ],
          }),
        };
      }
      // Fallback para solana também vazio/sem histórico
      if (url.includes('network=solana')) {
        return { ok: true, json: async () => ({ history: [] }) };
      }
      return { ok: false, status: 404 };
    };

    const quotes = await loadSideShiftQuotes(mockFetch);
    expect(quotes['ethereum'].status).toBe('online');
    expect(quotes['solana'].status).toBe('unavailable');
    expect(quotes['solana'].error).toContain('Não foi encontrada cotação válida');
    expect(quotes['robinhood'].status).toBe('online');
  });

  // E. Fallback funciona
  it('E. fallback para /api/quotes/history funciona quando latest não possui cotação válida', async () => {
    const mockFetch = async (url: string) => {
      if (url === '/api/quotes/latest') {
        // latest vazio
        return { ok: true, json: async () => ({ quotes: [] }) };
      }
      if (url.includes('/api/quotes/history') && url.includes('network=solana')) {
        // fallback retorna a última válida
        return {
          ok: true,
          json: async () => ({
            history: [
              {
                provider: 'sideshift',
                destination_network: 'solana',
                quoted_amount: 193.45,
                effective_rate: 0.19345,
                source_amount: 1000,
                observed_at: '2026-10-08T11:45:00.000Z',
                success: 1,
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ history: [] }) };
    };

    const quotes = await loadSideShiftQuotes(mockFetch);
    expect(quotes['solana'].status).toBe('online');
    expect(quotes['solana'].quotedAmount).toBe(193.45);
    expect(quotes['solana'].effectiveRate).toBe(0.19345);
    expect(quotes['solana'].observedAt).toBe('2026-10-08T11:45:00.000Z');
  });

  // F. Ranking mistura corretamente Puro Swap + SideShift
  it('F. ranking mistura e ordena corretamente Puro Swap manual + SideShift monitoradas', () => {
    const manualQuote = {
      valid: true,
      sentAmount: 350,
      receivedAmount: 66.54, // rate ≈ 0.190114 (190,11 USDG por 1.000)
      effectiveRate: 66.54 / 350,
    };

    const mockQuotes = {
      ethereum: { network: 'ethereum', status: 'online', effectiveRate: 0.19150 }, // 191,50 USDG por 1.000
      solana: { network: 'solana', status: 'online', effectiveRate: 0.19300 },   // 193,00 USDG por 1.000
      robinhood: { network: 'robinhood', status: 'online', effectiveRate: 0.19200 }, // 192,00 USDG por 1.000
    };

    const list = buildQuotesForRanking(manualQuote, mockQuotes);
    expect(list).toHaveLength(4);

    const result = core.rankQuotes(list, { amount: 350, normalizeTo: 1000 });
    expect(result.ranked).toHaveLength(4);

    // Ordem esperada: Solana (0.193) > Robinhood (0.192) > Ethereum (0.1915) > Puro Swap (0.190114)
    expect(result.ranked.map((r: { id: string }) => r.id)).toEqual([
      'sideshift:solana',
      'sideshift:robinhood',
      'sideshift:ethereum',
      'puroswap:xlayer',
    ]);
    expect(result.best.id).toBe('sideshift:solana');
  });

  // G. Diferença absoluta e percentual estão corretas
  it('G. diferença absoluta e percentual estão calculadas corretamente em relação à melhor cotação', () => {
    const manualQuote = {
      valid: true,
      sentAmount: 350,
      receivedAmount: 66.54,
      effectiveRate: 66.54 / 350,
    };

    const mockQuotes = {
      solana: { network: 'solana', status: 'online', effectiveRate: 67.15 / 350 }, // melhor = 67.15
    };

    const list = buildQuotesForRanking(manualQuote, mockQuotes);
    const result = core.rankQuotes(list, { amount: 350, normalizeTo: 1000 });

    const best = result.ranked[0];
    const puro = result.ranked[1];

    expect(best.isBest).toBe(true);
    expect(best.differenceForAmount.absolute).toBe(0);
    expect(best.differenceForAmount.percent).toBe(0);

    // Diferença Puro Swap vs Solana para 350 DEPIX:
    // 66.54 - 67.15 = -0.61 USDG
    // (-0.61 / 67.15) * 100 ≈ -0.9084%
    expect(puro.differenceForAmount.absolute).toBeCloseTo(-0.61, 6);
    expect(puro.differenceForAmount.percent).toBeCloseTo((-0.61 / 67.15) * 100, 4);
  });

  // H. Falha da API não impede cálculo manual
  it('H. falha total da API SideShift não impede cálculo manual do Puro Swap', async () => {
    const mockFetch = async () => {
      throw new Error('Falha de conexão / rede offline');
    };

    const quotes = await loadSideShiftQuotes(mockFetch);
    // Todas as redes ficam unavailable sem lançar erro não tratado
    expect(quotes['ethereum'].status).toBe('unavailable');
    expect(quotes['solana'].status).toBe('unavailable');
    expect(quotes['robinhood'].status).toBe('unavailable');

    // Cálculo manual do Puro Swap é executado normalmente
    const manualQuote = {
      valid: true,
      sentAmount: 350,
      receivedAmount: 66.54,
      effectiveRate: 66.54 / 350,
    };

    const list = buildQuotesForRanking(manualQuote, quotes);
    expect(list).toHaveLength(1); // Somente Puro Swap entra no ranking
    const result = core.rankQuotes(list, { amount: 350, normalizeTo: 1000 });
    expect(result.ranked).toHaveLength(1);
    expect(result.best.id).toBe('puroswap:xlayer');
    expect(result.best.receivedForAmount).toBeCloseTo(66.54, 6);
  });

  // I. Nenhuma chamada POST/PUT/PATCH/DELETE é realizada
  it('I. verificação de segurança: nenhuma chamada POST/PUT/PATCH/DELETE ou endpoint proibido existe no código', () => {
    const calcJsContent = fs.readFileSync(
      path.resolve(__dirname, '../src/dashboard/calculator.js'),
      'utf-8',
    );

    // 1. Proibido conter métodos de escrita
    expect(calcJsContent).not.toMatch(/method:\s*['"]POST['"]/i);
    expect(calcJsContent).not.toMatch(/method:\s*['"]PUT['"]/i);
    expect(calcJsContent).not.toMatch(/method:\s*['"]PATCH['"]/i);
    expect(calcJsContent).not.toMatch(/method:\s*['"]DELETE['"]/i);

    // 2. Proibido conter rotas de swap/ordem/execução financeira
    expect(calcJsContent).not.toMatch(/\/api\/orders/i);
    expect(calcJsContent).not.toMatch(/\/swap/i);
    expect(calcJsContent).not.toMatch(/\/withdraw/i);
    expect(calcJsContent).not.toMatch(/\/deposit/i);
    expect(calcJsContent).not.toMatch(/sideshift\.ai/i);

    // 3. Confirmar que as únicas URLs chamadas via fetch são os endpoints GET autorizados
    // Busca todas as chamadas _fetch e as URLs construídas para elas
    expect(calcJsContent).toContain("base + '/api/quotes/latest'");
    expect(calcJsContent).toContain("base + '/api/quotes/history?provider=sideshift&network='");

    // Garantir que não há outra URL sendo chamada com _fetch
    const fetchCalls = calcJsContent.match(/_fetch\([^\)]+\)/g) || [];
    expect(fetchCalls.length).toBe(2); // exatamente 2 chamadas: latest e history fallback
    expect(fetchCalls[0]).toContain("base + '/api/quotes/latest'");
    expect(fetchCalls[1]).toContain('fallbackUrl');
  });

  // J. Nenhum dado é persistido
  it('J. nenhum dado é persistido (sem localStorage/sessionStorage/indexedDB ou escrita)', () => {
    const calcJsContent = fs.readFileSync(
      path.resolve(__dirname, '../src/dashboard/calculator.js'),
      'utf-8',
    );
    expect(calcJsContent).not.toMatch(/localStorage/i);
    expect(calcJsContent).not.toMatch(/sessionStorage/i);
    expect(calcJsContent).not.toMatch(/indexedDB/i);
  });

});
