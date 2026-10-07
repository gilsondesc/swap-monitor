// src/services/statistics.service.ts
import { getQuotesHistory } from '../database/db';
import { config } from '../config/config';

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

export interface RouteStats extends ProviderStats {
  source_asset: string;
  source_network: string;
  destination_asset: string;
  destination_network: string;
  route_key: string;
  route_label: string;
  effective_rate: number | null;
  minimum_amount: number | null;
  maximum_amount: number | null;
  status: 'online' | 'error' | 'pending';
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

export function getRouteStats(
  provider: string,
  network: string,
  asset = config.swap.destination.asset,
  sourceAsset = config.swap.source.asset,
  sourceNetwork = config.swap.source.network,
): RouteStats {
  const filter = { provider, network, asset };
  const h1Quotes  = getQuotesHistory(1, filter);
  const h6Quotes  = getQuotesHistory(6, filter);
  const h24Quotes = getQuotesHistory(24, filter);

  const h1  = h1Quotes.map((r) => r.quoted_amount).filter((v): v is number => v !== null);
  const h6  = h6Quotes.map((r) => r.quoted_amount).filter((v): v is number => v !== null);
  const h24 = h24Quotes.map((r) => r.quoted_amount).filter((v): v is number => v !== null);

  const latestQuote = h1Quotes[0] ?? h6Quotes[0] ?? h24Quotes[0] ?? null;
  const latest = latestQuote?.quoted_amount ?? null;
  const effectiveRate = latestQuote?.effective_rate ?? (latest !== null && latestQuote?.source_amount ? latest / latestQuote.source_amount : null);
  const minAmount = latestQuote?.minimum_amount ?? null;
  const maxAmount = latestQuote?.maximum_amount ?? null;

  const avg24 = average(h24);
  const best24 = best(h24);

  const networkLabel = network.charAt(0).toUpperCase() + network.slice(1);
  const providerLabel = provider === 'sideshift' ? 'SideShift' : provider.toUpperCase();

  return {
    provider,
    source_asset: sourceAsset,
    source_network: sourceNetwork,
    destination_asset: asset,
    destination_network: network,
    route_key: `${provider}:${asset.toLowerCase()}:${network.toLowerCase()}`,
    route_label: `${providerLabel} (${networkLabel})`,
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
    effective_rate: effectiveRate,
    minimum_amount: minAmount,
    maximum_amount: maxAmount,
    status: latest !== null ? 'online' : h24Quotes.length > 0 ? 'error' : 'pending',
  };
}

export function getAllActiveRoutesStats(): RouteStats[] {
  const networks = config.destinationNetworks;
  const asset = config.swap.destination.asset;
  const sourceAsset = config.swap.source.asset;
  const sourceNetwork = config.swap.source.network;

  return networks.map((net) =>
    getRouteStats('sideshift', net, asset, sourceAsset, sourceNetwork),
  );
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
