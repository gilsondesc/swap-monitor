// tests/route-isolation.test.ts
// Testa isolamento de rotas: falha em uma rede não impede a consulta das outras
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareBestRoute } from '../src/services/comparison.service';
import type { RouteStats } from '../src/services/statistics.service';

function makeRouteStats(network: string, amount: number | null, success = true): RouteStats {
  return {
    provider: 'sideshift',
    source_asset: 'DEPIX',
    source_network: 'liquid',
    destination_asset: 'USDG',
    destination_network: network,
    route_key: `sideshift:usdg:${network}`,
    route_label: `SideShift (${network.charAt(0).toUpperCase() + network.slice(1)})`,
    count: success ? 10 : 0,
    average_1h: amount,
    average_6h: amount,
    average_24h: amount,
    best_1h: amount,
    best_6h: amount,
    best_24h: amount,
    worst_1h: amount,
    worst_6h: amount,
    worst_24h: amount,
    difference_vs_average_24h: null,
    difference_vs_best_24h: null,
    latest_quoted_amount: amount,
    effective_rate: amount !== null ? amount / 1000 : null,
    minimum_amount: 50,
    maximum_amount: 100000,
    status: success ? 'online' : 'error',
  };
}

describe('Isolamento de Rotas e Resiliência', () => {
  it('se Solana falhar, Ethereum e Robinhood continuam operando e são comparados', () => {
    const ethRoute = makeRouteStats('ethereum', 192.46, true);
    const solRoute = makeRouteStats('solana', null, false); // Solana em erro
    const robRoute = makeRouteStats('robinhood', 193.18, true);

    const comparison = compareBestRoute([ethRoute, solRoute, robRoute]);

    // A melhor rota é Robinhood (193.18)
    expect(comparison.best_network).toBe('robinhood');
    expect(comparison.best_quoted_amount).toBe(193.18);
    // A segunda rota é Ethereum (192.46)
    expect(comparison.second_route?.destination_network).toBe('ethereum');
    expect(comparison.ranked_routes.length).toBe(2);

    // Diferença calculada entre as duas rotas funcionais
    expect(comparison.provider_difference_pct).toBeGreaterThan(0);
    expect(comparison.provider_difference_label).toContain('Robinhood');
  });

  it('quando apenas uma rota tiver sucesso, ela é eleita sem quebrar o sistema', () => {
    const ethRoute = makeRouteStats('ethereum', null, false);
    const solRoute = makeRouteStats('solana', 193.15, true);
    const robRoute = makeRouteStats('robinhood', null, false);

    const comparison = compareBestRoute([ethRoute, solRoute, robRoute]);

    expect(comparison.best_network).toBe('solana');
    expect(comparison.best_quoted_amount).toBe(193.15);
    expect(comparison.second_route).toBeNull();
    expect(comparison.ranked_routes.length).toBe(1);
  });

  it('quando todas as rotas falharem, retorna estado seguro sem lançar exceção', () => {
    const ethRoute = makeRouteStats('ethereum', null, false);
    const solRoute = makeRouteStats('solana', null, false);
    const robRoute = makeRouteStats('robinhood', null, false);

    const comparison = compareBestRoute([ethRoute, solRoute, robRoute]);

    expect(comparison.best_route).toBeNull();
    expect(comparison.best_quoted_amount).toBeNull();
    expect(comparison.ranked_routes.length).toBe(0);
  });
});
