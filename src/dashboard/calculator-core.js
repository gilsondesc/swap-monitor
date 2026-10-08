// src/dashboard/calculator-core.js
// ------------------------------------------------------------------
// Núcleo de cálculo da Calculadora de Transação / Comparador de Cotações.
//
// APENAS FUNÇÕES PURAS:
//   - sem DOM, sem fetch, sem banco, sem API, sem localStorage;
//   - não importa nada do monitor (quote-monitor, comparison.service,
//     statistics.service, db). Totalmente independente.
//
// PRECISÃO:
//   - Nenhuma função arredonda valores. O arredondamento é responsabilidade
//     exclusiva da camada de exibição.
//
// NORMALIZAÇÃO (aviso):
//   - normalizeQuote() é uma REFERÊNCIA MATEMÁTICA linear (received / sent × N).
//   - Cotações reais podem conter taxas fixas; por isso rankQuotes() calcula
//     SEMPRE também o valor para o montante REAL informado pelo usuário.
//
// Exposição:
//   - Navegador: window.SwapCalculatorCore
//   - Node/Vitest: module.exports
// ------------------------------------------------------------------
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SwapCalculatorCore = api;
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  var DEFAULT_NORMALIZE_TO = 1000;
  // Tolerância absoluta para considerar duas cotações efetivas empatadas
  var DEFAULT_TIE_EPSILON = 1e-12;

  // ----------------------------------------------------------------
  // Utilidades internas
  // ----------------------------------------------------------------

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function isPositive(n) {
    return isFiniteNumber(n) && n > 0;
  }

  // ----------------------------------------------------------------
  // parseAmount
  // ----------------------------------------------------------------
  /**
   * Converte entrada numérica (formato brasileiro ou internacional) em number.
   *
   * Aceita: 350 | "350" | "350,00" | "350.00" | "66,54" | "66.54"
   *         "1.000,50" | "1,000.50" | "1.000.000" | " 66,54 " | "-5"
   *
   * Regras:
   *   - Vírgula e ponto juntos: o ÚLTIMO separador é o decimal.
   *   - Apenas vírgula(s): uma vírgula = decimal; várias = inválido.
   *   - Apenas ponto(s): um ponto = decimal; vários = separador de milhar.
   *     (Ex.: "1.000" → 1. Para milhar use "1000", "1.000,00" ou "1.000.000".)
   *
   * Retorna `null` para vazio, texto inválido, NaN ou Infinity.
   * NÃO rejeita zero nem negativos (isso é papel da validação).
   *
   * @param {unknown} input
   * @returns {number|null}
   */
  function parseAmount(input) {
    if (typeof input === 'number') {
      return isFiniteNumber(input) ? input : null;
    }
    if (typeof input !== 'string') return null;

    var s = input.replace(/[\s\u00a0]/g, '');
    if (s === '') return null;

    var negative = false;
    if (s.charAt(0) === '-') {
      negative = true;
      s = s.slice(1);
    } else if (s.charAt(0) === '+') {
      s = s.slice(1);
    }
    if (s === '') return null;

    // Somente dígitos, vírgulas e pontos a partir daqui
    if (!/^[0-9.,]+$/.test(s)) return null;

    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    var normalized;

    if (lastComma !== -1 && lastDot !== -1) {
      var decimalSep = lastComma > lastDot ? ',' : '.';
      var thousandSep = decimalSep === ',' ? '.' : ',';
      var parts = s.split(decimalSep);
      if (parts.length !== 2) return null;
      var intPart = parts[0];
      var fracPart = parts[1];
      // Milhar só pode aparecer na parte inteira e em grupos de 3 dígitos
      if (!new RegExp('^\\d{1,3}(\\' + thousandSep + '\\d{3})*$').test(intPart)) return null;
      if (!/^\d+$/.test(fracPart)) return null;
      normalized = intPart.split(thousandSep).join('') + '.' + fracPart;
    } else if (lastComma !== -1) {
      var commaParts = s.split(',');
      if (commaParts.length !== 2) return null;
      normalized = commaParts[0] + '.' + commaParts[1];
    } else if (lastDot !== -1) {
      var dotParts = s.split('.');
      if (dotParts.length === 2) {
        normalized = s;
      } else {
        if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
        normalized = dotParts.join('');
      }
    } else {
      normalized = s;
    }

    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null;

    var value = Number(normalized);
    if (!isFiniteNumber(value)) return null;
    if (negative && value !== 0) value = -value;
    return value;
  }

  // ----------------------------------------------------------------
  // calculateEffectiveRate
  // ----------------------------------------------------------------
  /**
   * Cotação efetiva = recebido / enviado (sem arredondamento).
   * Retorna null se algum valor for inválido, zero ou negativo.
   *
   * @param {unknown} sent
   * @param {unknown} received
   * @returns {number|null}
   */
  function calculateEffectiveRate(sent, received) {
    var s = parseAmount(sent);
    var r = parseAmount(received);
    if (!isPositive(s) || !isPositive(r)) return null;
    return r / s;
  }

  // ----------------------------------------------------------------
  // normalizeQuote
  // ----------------------------------------------------------------
  /**
   * Referência matemática linear: quanto seria recebido para `normalizeTo`
   * unidades enviadas, mantendo a mesma cotação efetiva.
   *
   *   normalizeQuote(350, 66.54)        → 190.1142857...
   *   normalizeQuote(350, 66.54, 500)   → 95.0571428...
   *
   * ATENÇÃO: não considera taxas fixas. Use também calculateReceivedForAmount
   * com o valor real enviado.
   *
   * @param {unknown} sent
   * @param {unknown} received
   * @param {unknown} [normalizeTo=1000]
   * @returns {number|null}
   */
  function normalizeQuote(sent, received, normalizeTo) {
    var target = normalizeTo === undefined ? DEFAULT_NORMALIZE_TO : parseAmount(normalizeTo);
    if (!isPositive(target)) return null;
    var rate = calculateEffectiveRate(sent, received);
    if (rate === null) return null;
    return rate * target;
  }

  // ----------------------------------------------------------------
  // calculateReceivedForAmount
  // ----------------------------------------------------------------
  /**
   * Valor recebido estimado para um montante enviado, dada a cotação efetiva.
   *
   * @param {unknown} effectiveRate
   * @param {unknown} amount
   * @returns {number|null}
   */
  function calculateReceivedForAmount(effectiveRate, amount) {
    var rate = parseAmount(effectiveRate);
    var a = parseAmount(amount);
    if (!isPositive(rate) || !isPositive(a)) return null;
    return rate * a;
  }

  // ----------------------------------------------------------------
  // calculateDifference
  // ----------------------------------------------------------------
  /**
   * Diferença de `value` em relação a `reference`.
   *   absolute = value − reference
   *   percent  = (value − reference) / reference × 100
   *
   * Negativo = `value` é pior (recebe menos) que a referência.
   * Retorna null se algum valor for inválido ou se reference <= 0.
   *
   * @param {unknown} value
   * @param {unknown} reference
   * @returns {{ absolute: number, percent: number } | null}
   */
  function calculateDifference(value, reference) {
    var v = parseAmount(value);
    var ref = parseAmount(reference);
    if (!isFiniteNumber(v) || !isPositive(ref)) return null;
    var absolute = v - ref;
    return { absolute: absolute, percent: (absolute / ref) * 100 };
  }

  // ----------------------------------------------------------------
  // validateManualQuote
  // ----------------------------------------------------------------
  var MESSAGES = {
    REQUIRED: 'Campo obrigatório.',
    INVALID_NUMBER: 'Número inválido.',
    ZERO: 'O valor deve ser maior que zero.',
    NEGATIVE: 'O valor não pode ser negativo.',
  };

  function validateField(field, raw, errors) {
    var isEmpty = raw === undefined || raw === null ||
      (typeof raw === 'string' && raw.replace(/[\s\u00a0]/g, '') === '');
    if (isEmpty) {
      errors.push({ field: field, code: 'REQUIRED', message: MESSAGES.REQUIRED });
      return null;
    }
    var value = parseAmount(raw);
    if (value === null) {
      errors.push({ field: field, code: 'INVALID_NUMBER', message: MESSAGES.INVALID_NUMBER });
      return null;
    }
    if (value === 0) {
      errors.push({ field: field, code: 'ZERO', message: MESSAGES.ZERO });
      return null;
    }
    if (value < 0) {
      errors.push({ field: field, code: 'NEGATIVE', message: MESSAGES.NEGATIVE });
      return null;
    }
    return value;
  }

  /**
   * Valida uma cotação informada manualmente (ex.: Puro Swap).
   *
   * @param {{ sent: unknown, received: unknown }} input
   * @returns {{
   *   valid: boolean,
   *   errors: Array<{ field: 'sent'|'received', code: string, message: string }>,
   *   sentAmount: number|null,
   *   receivedAmount: number|null,
   *   effectiveRate: number|null
   * }}
   */
  function validateManualQuote(input) {
    var src = input && typeof input === 'object' ? input : {};
    var errors = [];
    var sentAmount = validateField('sent', src.sent, errors);
    var receivedAmount = validateField('received', src.received, errors);
    var valid = errors.length === 0;
    return {
      valid: valid,
      errors: errors,
      sentAmount: sentAmount,
      receivedAmount: receivedAmount,
      effectiveRate: valid ? receivedAmount / sentAmount : null,
    };
  }

  // ----------------------------------------------------------------
  // rankQuotes
  // ----------------------------------------------------------------
  function resolveRate(quote) {
    if (!quote || typeof quote !== 'object') return null;
    var direct = parseAmount(quote.effectiveRate);
    if (isPositive(direct)) return direct;
    return calculateEffectiveRate(quote.sentAmount, quote.receivedAmount);
  }

  function compareIds(a, b) {
    var ia = a == null ? '' : String(a);
    var ib = b == null ? '' : String(b);
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  }

  /**
   * Ranqueia cotações pela cotação efetiva (maior recebido = melhor).
   *
   * Cada cotação de entrada deve ter `effectiveRate` OU (`sentAmount` + `receivedAmount`).
   * Demais campos (id, provider, network, mode, observedAt...) são preservados.
   *
   * Para cada cotação válida calcula:
   *   - effectiveRate
   *   - normalizedReceived      (para `normalizeTo`, referência linear)
   *   - receivedForAmount       (para o valor REAL `amount`, se informado)
   *   - differenceNormalized    ({absolute, percent} vs. melhor, base normalizada)
   *   - differenceForAmount     ({absolute, percent} vs. melhor, valor real)
   *   - rank                    (empates recebem o mesmo rank: 1, 1, 3...)
   *   - isBest                  (true para todas empatadas no 1º lugar)
   *
   * Ordem determinística: rate desc → id asc → posição original.
   * Cotações inválidas vão para `invalid` (não ranqueadas).
   *
   * @param {Array<object>} quotes
   * @param {{ amount?: unknown, normalizeTo?: unknown, tieEpsilon?: number }} [options]
   * @returns {{
   *   ranked: Array<object>,
   *   invalid: Array<object>,
   *   best: object|null,
   *   hasTie: boolean,
   *   amount: number|null,
   *   normalizeTo: number
   * }}
   */
  function rankQuotes(quotes, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var normalizeTo = opts.normalizeTo === undefined ? DEFAULT_NORMALIZE_TO : parseAmount(opts.normalizeTo);
    if (!isPositive(normalizeTo)) normalizeTo = DEFAULT_NORMALIZE_TO;
    var amount = opts.amount === undefined ? null : parseAmount(opts.amount);
    if (!isPositive(amount)) amount = null;
    var epsilon = isFiniteNumber(opts.tieEpsilon) && opts.tieEpsilon >= 0
      ? opts.tieEpsilon
      : DEFAULT_TIE_EPSILON;

    var list = Array.isArray(quotes) ? quotes : [];
    var valid = [];
    var invalid = [];

    list.forEach(function (quote, index) {
      var rate = resolveRate(quote);
      if (rate === null) {
        invalid.push(Object.assign({}, quote, { originalIndex: index }));
        return;
      }
      valid.push({ quote: quote, rate: rate, index: index });
    });

    valid.sort(function (a, b) {
      if (Math.abs(a.rate - b.rate) > epsilon) return b.rate - a.rate;
      var byId = compareIds(a.quote && a.quote.id, b.quote && b.quote.id);
      if (byId !== 0) return byId;
      return a.index - b.index;
    });

    var bestRate = valid.length > 0 ? valid[0].rate : null;
    var bestNormalized = bestRate !== null ? bestRate * normalizeTo : null;
    var bestForAmount = bestRate !== null && amount !== null ? bestRate * amount : null;

    var ranked = [];
    var currentRank = 0;
    var previousRate = null;

    valid.forEach(function (item, position) {
      if (previousRate === null || Math.abs(previousRate - item.rate) > epsilon) {
        currentRank = position + 1;
        previousRate = item.rate;
      }
      var normalizedReceived = item.rate * normalizeTo;
      var receivedForAmount = amount !== null ? item.rate * amount : null;

      ranked.push(Object.assign({}, item.quote, {
        originalIndex: item.index,
        effectiveRate: item.rate,
        normalizeTo: normalizeTo,
        normalizedReceived: normalizedReceived,
        amount: amount,
        receivedForAmount: receivedForAmount,
        differenceNormalized: calculateDifference(normalizedReceived, bestNormalized),
        differenceForAmount: receivedForAmount !== null
          ? calculateDifference(receivedForAmount, bestForAmount)
          : null,
        rank: currentRank,
        isBest: currentRank === 1,
      }));
    });

    var bestCount = ranked.filter(function (r) { return r.isBest; }).length;

    return {
      ranked: ranked,
      invalid: invalid,
      best: ranked.length > 0 ? ranked[0] : null,
      hasTie: bestCount > 1,
      amount: amount,
      normalizeTo: normalizeTo,
    };
  }

  // ----------------------------------------------------------------
  // Helpers de catálogo (puros — recebem o catálogo por parâmetro)
  // ----------------------------------------------------------------

  /**
   * Chave de rota padronizada: 'DEPIX:liquid>USDG'
   */
  function buildRouteKey(sendAsset, sendNetwork, receiveAsset) {
    return String(sendAsset) + ':' + String(sendNetwork) + '>' + String(receiveAsset);
  }

  /**
   * Lista os provedores que atendem uma rota + rede de recebimento,
   * na ordem declarada no catálogo.
   *
   * @returns {Array<object>} provedores do catálogo
   */
  function getProvidersForRoute(catalog, sendAsset, sendNetwork, receiveAsset, receiveNetwork) {
    if (!catalog || !catalog.providers) return [];
    var key = buildRouteKey(sendAsset, sendNetwork, receiveAsset);
    return Object.keys(catalog.providers)
      .map(function (id) { return catalog.providers[id]; })
      .filter(function (p) {
        var nets = p && p.routes ? p.routes[key] : null;
        return Array.isArray(nets) && nets.indexOf(receiveNetwork) !== -1;
      });
  }

  /**
   * Verifica a consistência interna do catálogo.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateCatalog(catalog) {
    var errors = [];
    var VALID_MODES = ['manual', 'cached', 'live'];
    if (!catalog || typeof catalog !== 'object') {
      return { valid: false, errors: ['Catálogo ausente'] };
    }
    var assets = catalog.assets || {};
    var networks = catalog.networks || {};
    var providers = catalog.providers || {};

    function checkSide(side) {
      (catalog[side] || []).forEach(function (entry) {
        if (!assets[entry.asset]) errors.push(side + ': ativo desconhecido ' + entry.asset);
        (entry.networks || []).forEach(function (n) {
          if (!networks[n]) errors.push(side + ': rede desconhecida ' + n);
        });
      });
    }
    checkSide('send');
    checkSide('receive');

    Object.keys(providers).forEach(function (id) {
      var p = providers[id];
      if (VALID_MODES.indexOf(p.mode) === -1) errors.push('provider ' + id + ': modo inválido ' + p.mode);
      Object.keys(p.routes || {}).forEach(function (key) {
        var m = /^([^:]+):([^>]+)>(.+)$/.exec(key);
        if (!m) { errors.push('provider ' + id + ': rota inválida ' + key); return; }
        if (!assets[m[1]]) errors.push('provider ' + id + ': ativo desconhecido ' + m[1]);
        if (!networks[m[2]]) errors.push('provider ' + id + ': rede desconhecida ' + m[2]);
        if (!assets[m[3]]) errors.push('provider ' + id + ': ativo desconhecido ' + m[3]);
        (p.routes[key] || []).forEach(function (n) {
          if (!networks[n]) errors.push('provider ' + id + ': rede desconhecida ' + n);
        });
      });
    });

    var d = catalog.defaults || {};
    if (!assets[d.sendAsset]) errors.push('defaults: sendAsset desconhecido');
    if (!networks[d.sendNetwork]) errors.push('defaults: sendNetwork desconhecida');
    if (!assets[d.receiveAsset]) errors.push('defaults: receiveAsset desconhecido');
    if (!networks[d.receiveNetwork]) errors.push('defaults: receiveNetwork desconhecida');
    if (d.provider !== undefined && !providers[d.provider]) errors.push('defaults: provider desconhecido');
    if (!isPositive(d.normalizeTo)) errors.push('defaults: normalizeTo inválido');

    return { valid: errors.length === 0, errors: errors };
  }

  return Object.freeze({
    DEFAULT_NORMALIZE_TO: DEFAULT_NORMALIZE_TO,
    DEFAULT_TIE_EPSILON: DEFAULT_TIE_EPSILON,
    parseAmount: parseAmount,
    calculateEffectiveRate: calculateEffectiveRate,
    normalizeQuote: normalizeQuote,
    calculateReceivedForAmount: calculateReceivedForAmount,
    calculateDifference: calculateDifference,
    rankQuotes: rankQuotes,
    validateManualQuote: validateManualQuote,
    buildRouteKey: buildRouteKey,
    getProvidersForRoute: getProvidersForRoute,
    validateCatalog: validateCatalog,
  });
});
