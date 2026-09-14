// src/providers/sideshift/client.ts
import { config } from '../../config/config';
import { parsePairResponse, parseQuoteResponse } from './parser';
import type { ParsedSideShiftQuote } from './types';

const PROVIDER = 'SideShift';

// ----------------------------------------------------------------
// HTTP helper com timeout + retry + exponential backoff
// ----------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.http.timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (attempt < config.http.maxRetries - 1) {
      const delay = config.http.retryBaseMs * Math.pow(2, attempt);
      console.log(`[${PROVIDER}] retry ${attempt + 1}/${config.http.maxRetries - 1} em ${delay}ms`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  // Nunca logar a chave
  if (config.sideshift.apiKey) {
    headers['x-sideshift-secret'] = config.sideshift.apiKey;
  }
  return headers;
}

// ----------------------------------------------------------------
// Endpoint: GET /v2/pair/:depositCoin-:depositNetwork/:settleCoin-:settleNetwork
// Não requer autenticação — retorna rate, min, max
// ----------------------------------------------------------------
async function getPair(amount: number): Promise<ParsedSideShiftQuote> {
  const { source, destination } = config.swap;
  const from = `${source.asset}-${source.network}`;
  const to = `${destination.asset}-${destination.network}`;
  const url = `${config.sideshift.apiBaseUrl}/pair/${from}/${to}?amount=${amount}`;

  console.log(`[${PROVIDER}] quote requested → ${url.replace(config.sideshift.apiKey || '__no_key__', '[REDACTED]')}`);

  let raw: unknown;
  try {
    const res = await fetchWithRetry(url, { headers: buildHeaders() });
    raw = await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${PROVIDER}] ERROR: ${msg}`);
    return {
      provider: 'sideshift',
      success: false,
      error: msg,
      depositCoin: source.asset,
      depositNetwork: source.network,
      settleCoin: destination.asset,
      settleNetwork: destination.network,
      sourceAmount: amount,
      quotedAmount: null,
      effectiveRate: null,
      minimumAmount: null,
      maximumAmount: null,
      networkFee: null,
      serviceFee: null,
      quoteType: 'variable',
      quoteId: null,
      rawResponse: JSON.stringify({ error: msg }),
      observedAt: new Date().toISOString(),
    };
  }

  const parsed = parsePairResponse(raw, amount);
  if (parsed.success) {
    console.log(`[${PROVIDER}] quote received: ${parsed.quotedAmount} ${destination.asset}`);
  } else {
    console.warn(`[${PROVIDER}] quote failed: ${parsed.error}`);
  }
  return parsed;
}

// ----------------------------------------------------------------
// Endpoint: POST /v2/quotes (requer API key)
// ----------------------------------------------------------------
async function postQuote(amount: number): Promise<ParsedSideShiftQuote> {
  const { source, destination } = config.swap;
  const url = `${config.sideshift.apiBaseUrl}/quotes`;

  const body = {
    depositCoin: source.asset,
    depositNetwork: source.network,
    settleCoin: destination.asset,
    settleNetwork: destination.network,
    depositAmount: String(amount),
    ...(config.sideshift.affiliateId ? { affiliateId: config.sideshift.affiliateId } : {}),
  };

  console.log(`[${PROVIDER}] fixed quote requested`);

  let raw: unknown;
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    raw = await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${PROVIDER}] ERROR (fixed quote): ${msg}`);
    return {
      provider: 'sideshift',
      success: false,
      error: msg,
      depositCoin: source.asset,
      depositNetwork: source.network,
      settleCoin: destination.asset,
      settleNetwork: destination.network,
      sourceAmount: amount,
      quotedAmount: null,
      effectiveRate: null,
      minimumAmount: null,
      maximumAmount: null,
      networkFee: null,
      serviceFee: null,
      quoteType: 'fixed',
      quoteId: null,
      rawResponse: JSON.stringify({ error: msg }),
      observedAt: new Date().toISOString(),
    };
  }

  const parsed = parseQuoteResponse(raw, amount);
  if (parsed.success) {
    console.log(`[${PROVIDER}] fixed quote received: ${parsed.quotedAmount} ${destination.asset}`);
  } else {
    console.warn(`[${PROVIDER}] fixed quote failed: ${parsed.error}`);
  }
  return parsed;
}

// ----------------------------------------------------------------
// Ponto de entrada principal do provider
// ----------------------------------------------------------------
export async function fetchSideShiftQuote(amount: number): Promise<ParsedSideShiftQuote> {
  if (!config.sideshift.enabled) {
    return {
      provider: 'sideshift',
      success: false,
      error: 'Provider desabilitado',
      depositCoin: config.swap.source.asset,
      depositNetwork: config.swap.source.network,
      settleCoin: config.swap.destination.asset,
      settleNetwork: config.swap.destination.network,
      sourceAmount: amount,
      quotedAmount: null,
      effectiveRate: null,
      minimumAmount: null,
      maximumAmount: null,
      networkFee: null,
      serviceFee: null,
      quoteType: null,
      quoteId: null,
      rawResponse: '{}',
      observedAt: new Date().toISOString(),
    };
  }

  // Prefere cotação fixa se API key disponível
  if (config.sideshift.apiKey) {
    const fixed = await postQuote(amount);
    if (fixed.success) return fixed;
    // Fallback para cotação variável
    console.log(`[${PROVIDER}] fallback para cotação variável`);
  }

  return getPair(amount);
}
