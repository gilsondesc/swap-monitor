// src/dashboard/calculator.js
// ------------------------------------------------------------------
// Interface da Calculadora de Transação / Comparador de Cotações.
//
// Depende EXCLUSIVAMENTE de:
//   - window.SwapCalculatorCatalog  (calculator-catalog.js) → fonte central de ativos, redes, provedores
//   - window.SwapCalculatorCore     (calculator-core.js)    → toda a matemática
//
// Etapa 3B (Refinamento Visual + Catálogo Extensível):
//   - Todas as redes e rotas são obtidas dinamicamente do catálogo.
//   - Puro Swap: identificado claramente como MANUAL.
//   - SideShift: identificado claramente como MONITOR.
//   - Cards SideShift e ranking aprimorados com destaque de empates justos.
//   - Nenhuma regra matemática foi alterada.
// ------------------------------------------------------------------
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SwapCalculator = api;
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  var DISPLAY = {
    rateDecimals: 6,
    amountDecimals: 2,
    inputMaxDecimals: 8,
  };

  var AMBIGUOUS_THOUSANDS = /^[+-]?\d{1,3}\.\d{3}$/;
  var AMBIGUOUS_MESSAGE = 'Para mil, use 1000 ou 1.000,00.';

  var catalog = null;
  var core = null;
  var el = {};
  var sideShiftQuotes = {};
  var lastManualCalculation = null;

  // ----------------------------------------------------------------
  // Acesso dinâmico ao Catálogo (sem listas hardcoded)
  // ----------------------------------------------------------------

  function getSideShiftNetworks() {
    if (catalog && catalog.providers && catalog.providers.sideshift && catalog.providers.sideshift.routes) {
      var r = catalog.providers.sideshift.routes['DEPIX:liquid>USDG'];
      if (Array.isArray(r) && r.length > 0) return r;
    }
    return ['ethereum', 'solana', 'robinhood'];
  }

  function assetLabel(id) {
    if (!catalog || !catalog.assets) return String(id);
    var a = catalog.assets[id];
    return a ? a.label : String(id);
  }

  function assetSymbol(id) {
    if (!catalog || !catalog.assets) return String(id);
    var a = catalog.assets[id];
    return a ? (a.symbol || a.id) : String(id);
  }

  function networkLabel(id) {
    if (!catalog || !catalog.networks) return String(id);
    var n = catalog.networks[id];
    return n ? n.label : (String(id).charAt(0).toUpperCase() + String(id).slice(1));
  }

  function providerList() {
    if (!catalog || !catalog.providers) return [];
    return Object.keys(catalog.providers).map(function (id) {
      return catalog.providers[id];
    });
  }

  function findSide(side, assetId) {
    if (!catalog) return null;
    var list = catalog[side] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].asset === assetId) return list[i];
    }
    return null;
  }

  function sideAssetItems(side) {
    if (!catalog) return [];
    return (catalog[side] || []).map(function (entry) {
      return { id: entry.asset, label: assetLabel(entry.asset) };
    });
  }

  function sideNetworkItems(side, assetId) {
    var entry = findSide(side, assetId);
    return (entry ? entry.networks : []).map(function (id) {
      return { id: id, label: networkLabel(id) };
    });
  }

  function currentSelection() {
    return {
      sendAsset: el.sendAsset ? el.sendAsset.value : 'DEPIX',
      sendNetwork: el.sendNetwork ? el.sendNetwork.value : 'liquid',
      receiveAsset: el.receiveAsset ? el.receiveAsset.value : 'USDG',
      receiveNetwork: el.receiveNetwork ? el.receiveNetwork.value : 'xlayer',
      provider: el.provider ? el.provider.value : 'puroswap',
    };
  }

  // ----------------------------------------------------------------
  // Utilidades de DOM e formatação
  // ----------------------------------------------------------------

  function $(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function formatNumber(value, minDecimals, maxDecimals) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
  }

  function formatRate(value) {
    return formatNumber(value, DISPLAY.rateDecimals, DISPLAY.rateDecimals);
  }

  function formatAmount(value) {
    return formatNumber(value, DISPLAY.amountDecimals, DISPLAY.amountDecimals);
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return String(iso);
    }
  }

  function clearChildren(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fillSelect(select, items, selectedId) {
    if (!select) return;
    clearChildren(select);
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      if (item.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
    if (items.length > 0 && !items.some(function (i) { return i.id === selectedId; })) {
      select.value = items[0].id;
    }
    select.disabled = items.length === 0;
  }

  // ----------------------------------------------------------------
  // Integração HTTP READ-ONLY com o backend existente
  // ----------------------------------------------------------------

  /**
   * Consulta cotações SideShift através dos endpoints existentes:
   *   1. GET /api/quotes/latest
   *   2. Fallback por rede se necessário:
   *      GET /api/quotes/history?provider=sideshift&network=<net>&hours=1&limit=1
   */
  async function loadSideShiftQuotes(fetchFn, apiBase) {
    var _fetch = fetchFn || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null);
    if (!_fetch) {
      throw new Error('fetch não disponível');
    }
    var base = typeof apiBase === 'string' ? apiBase : '';
    var targetNetworks = getSideShiftNetworks();
    var result = {};

    targetNetworks.forEach(function (net) {
      result[net] = {
        network: net,
        status: 'unavailable',
        quotedAmount: null,
        effectiveRate: null,
        sourceAmount: 1000,
        observedAt: null,
        error: 'Consultando...',
      };
    });

    var latestQuotes = [];
    try {
      var res = await _fetch(base + '/api/quotes/latest');
      if (res && res.ok) {
        var data = await res.json();
        latestQuotes = (data && Array.isArray(data.quotes)) ? data.quotes : [];
      }
    } catch (err) {
      // Falha no latest: tentará fallback individual por rede
    }

    for (var i = 0; i < targetNetworks.length; i++) {
      var net = targetNetworks[i];
      var match = null;

      for (var j = 0; j < latestQuotes.length; j++) {
        var q = latestQuotes[j];
        if (q && q.provider === 'sideshift' && q.destination_network === net) {
          if (q.success === 1 && typeof q.effective_rate === 'number' && q.effective_rate > 0) {
            match = q;
            break;
          }
        }
      }

      if (match) {
        result[net] = {
          network: net,
          status: 'online',
          quotedAmount: match.quoted_amount,
          effectiveRate: match.effective_rate,
          sourceAmount: match.source_amount || 1000,
          observedAt: match.observed_at || null,
          error: null,
        };
        continue;
      }

      // Fallback: consulta última cotação com sucesso na última hora
      try {
        var fallbackUrl = base + '/api/quotes/history?provider=sideshift&network=' +
          encodeURIComponent(net) + '&hours=1&limit=1';
        var fRes = await _fetch(fallbackUrl);
        if (fRes && fRes.ok) {
          var fData = await fRes.json();
          var fList = (fData && Array.isArray(fData.history)) ? fData.history : [];
          if (fList.length > 0 && fList[0].effective_rate > 0) {
            var fQuote = fList[0];
            result[net] = {
              network: net,
              status: 'online',
              quotedAmount: fQuote.quoted_amount,
              effectiveRate: fQuote.effective_rate,
              sourceAmount: fQuote.source_amount || 1000,
              observedAt: fQuote.observed_at || null,
              error: null,
            };
            continue;
          }
        }
      } catch (fErr) {
        // Fallback falhou
      }

      result[net] = {
        network: net,
        status: 'unavailable',
        quotedAmount: null,
        effectiveRate: null,
        sourceAmount: 1000,
        observedAt: null,
        error: 'Não foi encontrada cotação válida para esta rota.',
      };
    }

    return result;
  }

  // ----------------------------------------------------------------
  // Renderização dos cards SideShift
  // ----------------------------------------------------------------

  function renderSideShiftCards(quotesMap) {
    if (!el.sideShiftCards) return;
    clearChildren(el.sideShiftCards);

    var sendSym = assetSymbol('DEPIX');
    var recvSym = assetSymbol('USDG');
    var targetNetworks = getSideShiftNetworks();

    targetNetworks.forEach(function (net) {
      var q = quotesMap ? quotesMap[net] : null;
      var card = document.createElement('div');
      card.className = 'calc-side-card';

      var netTitle = networkLabel(net);
      var isOnline = q && q.status === 'online' && q.effectiveRate > 0;

      if (isOnline) {
        var quotedText = formatNumber(q.sourceAmount || 1000, 0, 0) + ' ' + sendSym +
          ' → ' + formatAmount(q.quotedAmount) + ' ' + recvSym;
        var rateText = 'Taxa: ' + formatRate(q.effectiveRate) + ' ' + recvSym + ' / ' + sendSym;
        var timeText = 'Atualizado: ' + formatTime(q.observedAt);

        card.innerHTML =
          '<div class="calc-card-net">' +
            '<div>' +
              '<div class="calc-card-provider">SideShift</div>' +
              '<div class="calc-card-net-name">' + netTitle + '</div>' +
            '</div>' +
            '<span class="calc-status-badge calc-status-online">● Disponível</span>' +
          '</div>' +
          '<div class="calc-card-val">' + quotedText + '</div>' +
          '<div class="calc-card-rate">' + rateText + '</div>' +
          '<div class="calc-card-footer">' +
            '<span class="calc-card-time">' + timeText + '</span>' +
          '</div>';
      } else {
        var errorMsg = (q && q.error) ? q.error : 'Não foi encontrada cotação válida para esta rota.';
        card.innerHTML =
          '<div class="calc-card-net">' +
            '<div>' +
              '<div class="calc-card-provider">SideShift</div>' +
              '<div class="calc-card-net-name">' + netTitle + '</div>' +
            '</div>' +
            '<span class="calc-status-badge calc-status-offline">● Indisponível</span>' +
          '</div>' +
          '<div class="calc-card-val" style="color:var(--text-faint)">Indisponível</div>' +
          '<div class="calc-card-msg">' + errorMsg + '</div>' +
          '<div class="calc-card-footer">' +
            '<span class="calc-card-time">—</span>' +
          '</div>';
      }

      el.sideShiftCards.appendChild(card);
    });
  }

  // ----------------------------------------------------------------
  // Montagem e Ranking de Cotações (Puro Swap + SideShift)
  // ----------------------------------------------------------------

  function buildQuotesForRanking(manualQuote, quotesMap) {
    var list = [];

    if (manualQuote && manualQuote.valid) {
      list.push({
        id: 'puroswap:xlayer',
        providerId: 'puroswap',
        providerLabel: 'Puro Swap',
        networkId: 'xlayer',
        networkLabel: networkLabel('xlayer'),
        mode: 'manual',
        badgeLabel: 'MANUAL',
        sentAmount: manualQuote.sentAmount,
        receivedAmount: manualQuote.receivedAmount,
        effectiveRate: manualQuote.effectiveRate,
        observedAtText: 'Manual',
      });
    }

    if (quotesMap) {
      var targetNetworks = getSideShiftNetworks();
      targetNetworks.forEach(function (net) {
        var q = quotesMap[net];
        if (q && q.status === 'online' && q.effectiveRate > 0) {
          list.push({
            id: 'sideshift:' + net,
            providerId: 'sideshift',
            providerLabel: 'SideShift',
            networkId: net,
            networkLabel: networkLabel(net),
            mode: 'cached',
            badgeLabel: 'MONITOR',
            effectiveRate: q.effectiveRate,
            observedAtText: formatTime(q.observedAt),
          });
        }
      });
    }

    return list;
  }

  function renderComparisonTable(rankResult, sentAmount) {
    if (!el.comparisonSection || !el.comparisonTbody) return;

    clearChildren(el.comparisonTbody);

    if (!rankResult || !rankResult.ranked || rankResult.ranked.length === 0) {
      el.comparisonSection.hidden = true;
      return;
    }

    el.comparisonSection.hidden = false;

    var sendSym = assetSymbol('DEPIX');
    var recvSym = assetSymbol('USDG');

    if (el.comparisonSubtitle) {
      el.comparisonSubtitle.textContent =
        'Comparando ' + rankResult.ranked.length + ' opções para o mesmo valor enviado (' +
        formatNumber(sentAmount, 0, DISPLAY.inputMaxDecimals) + ' ' + sendSym + ')';
    }

    // Badge de destaque para a melhor cotação
    if (el.bestBadge) {
      if (rankResult.best) {
        el.bestBadge.hidden = false;
        var bestName = rankResult.best.providerLabel + ' — ' + rankResult.best.networkLabel;
        el.bestBadge.textContent = '🏆 Melhor Cotação: ' + bestName;
      } else {
        el.bestBadge.hidden = true;
      }
    }

    // Preenche linhas da tabela
    rankResult.ranked.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.isBest) tr.className = 'calc-row-best';

      // Coluna Ranking (em caso de empate, todas as melhores recebem 🥇 1º)
      var tdRank = document.createElement('td');
      var rankBadge = document.createElement('span');
      rankBadge.className = 'calc-badge-rank' + (row.isBest ? ' calc-badge-rank-1' : '');
      rankBadge.textContent = (row.isBest ? '🥇 ' : '') + row.rank + 'º';
      tdRank.appendChild(rankBadge);

      // Coluna Provedor / Rede com identificação explícita do modo (MANUAL vs MONITOR)
      var tdProv = document.createElement('td');
      var provCell = document.createElement('div');
      provCell.className = 'calc-provider-cell';

      var nameSpan = document.createElement('strong');
      nameSpan.textContent = row.providerLabel + ' (' + row.networkLabel + ')';

      var modeTag = document.createElement('span');
      if (row.mode === 'manual') {
        modeTag.className = 'calc-badge-manual';
        modeTag.textContent = 'MANUAL';
      } else {
        modeTag.className = 'calc-badge-monitor';
        modeTag.textContent = 'MONITOR';
      }

      provCell.appendChild(nameSpan);
      provCell.appendChild(modeTag);
      tdProv.appendChild(provCell);

      // Coluna Recebido para o montante enviado
      var tdRecv = document.createElement('td');
      tdRecv.textContent = formatAmount(row.receivedForAmount) + ' ' + recvSym;
      if (row.isBest) tdRecv.style.color = 'var(--green)';

      // Coluna Referência 1.000 DEPIX
      var tdNorm = document.createElement('td');
      tdNorm.textContent = formatAmount(row.normalizedReceived) + ' ' + recvSym;

      // Coluna Diferença vs Melhor (a melhor cotação mostra 'Melhor cotação', sem valor negativo)
      var tdDiff = document.createElement('td');
      if (row.isBest) {
        tdDiff.innerHTML = '<span class="calc-diff-pos">Melhor cotação</span>';
      } else if (row.differenceForAmount) {
        var diffVal = row.differenceForAmount.absolute;
        var diffPct = row.differenceForAmount.percent;
        var diffCls = diffVal >= 0 ? 'calc-diff-pos' : 'calc-diff-neg';
        var sign = diffVal > 0 ? '+' : '';
        tdDiff.innerHTML =
          '<span class="' + diffCls + '">' +
            sign + formatAmount(diffVal) + ' ' + recvSym + ' (' +
            sign + formatNumber(diffPct, 2, 2) + '%)' +
          '</span>';
      } else {
        tdDiff.textContent = '—';
      }

      // Coluna Horário
      var tdTime = document.createElement('td');
      tdTime.style.color = 'var(--text-muted)';
      tdTime.textContent = row.observedAtText || '—';

      tr.appendChild(tdRank);
      tr.appendChild(tdProv);
      tr.appendChild(tdRecv);
      tr.appendChild(tdNorm);
      tr.appendChild(tdDiff);
      tr.appendChild(tdTime);

      el.comparisonTbody.appendChild(tr);
    });

    if (el.comparisonNote) {
      var targetNetworks = getSideShiftNetworks();
      var availableSideShiftCount = targetNetworks.filter(function (n) {
        return sideShiftQuotes && sideShiftQuotes[n] && sideShiftQuotes[n].status === 'online';
      }).length;

      if (availableSideShiftCount === 0) {
        el.comparisonNote.hidden = false;
        el.comparisonNote.textContent =
          'Nota: Nenhuma rota SideShift com cotação válida disponível no monitor para comparação neste momento.';
      } else {
        el.comparisonNote.hidden = false;
        el.comparisonNote.textContent =
          'Comparação calculada a partir da cotação efetiva de cada provedor para o montante informado.';
      }
    }
  }

  // ----------------------------------------------------------------
  // Ação de Atualização de Cotações
  // ----------------------------------------------------------------

  async function refreshQuotes() {
    if (el.refreshBtn) {
      el.refreshBtn.disabled = true;
    }
    if (el.quotesStatus) {
      el.quotesStatus.textContent = 'Consultando cotações do monitor...';
    }

    try {
      sideShiftQuotes = await loadSideShiftQuotes();
      renderSideShiftCards(sideShiftQuotes);

      var targetNetworks = getSideShiftNetworks();
      var onlineCount = targetNetworks.filter(function (n) {
        return sideShiftQuotes[n] && sideShiftQuotes[n].status === 'online';
      }).length;

      var nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (el.quotesStatus) {
        if (onlineCount > 0) {
          el.quotesStatus.textContent = 'Atualizado às ' + nowTime + ' (' + onlineCount + ' de ' + targetNetworks.length + ' rotas disponíveis)';
        } else {
          el.quotesStatus.textContent = 'Cotações do monitor indisponíveis no momento (atualizado às ' + nowTime + ')';
        }
      }

      // Se o usuário já tiver realizado um cálculo, atualiza o ranking automaticamente
      if (lastManualCalculation && lastManualCalculation.valid) {
        var quotesToRank = buildQuotesForRanking(lastManualCalculation, sideShiftQuotes);
        var rankResult = core.rankQuotes(quotesToRank, {
          amount: lastManualCalculation.sentAmount,
          normalizeTo: catalog.defaults.normalizeTo || 1000,
        });
        renderComparisonTable(rankResult, lastManualCalculation.sentAmount);
      }
    } catch (err) {
      if (el.quotesStatus) {
        el.quotesStatus.textContent = 'Não foi possível consultar as cotações do monitor.';
      }
      renderSideShiftCards(sideShiftQuotes);
    } finally {
      if (el.refreshBtn) {
        el.refreshBtn.disabled = false;
      }
    }
  }

  // ----------------------------------------------------------------
  // Regras de rota / provedor
  // ----------------------------------------------------------------

  function evaluateRoute(sel) {
    if (!core || !catalog) return { ok: true, provider: null, compatible: [] };
    var compatible = core.getProvidersForRoute(
      catalog, sel.sendAsset, sel.sendNetwork, sel.receiveAsset, sel.receiveNetwork
    );
    var provider = catalog.providers[sel.provider] || null;
    var ok = !!provider && compatible.some(function (p) { return p.id === provider.id; });
    return { ok: ok, provider: provider, compatible: compatible };
  }

  function describeRouteProblem(sel, route) {
    var target = assetSymbol(sel.receiveAsset) + ' na rede ' + networkLabel(sel.receiveNetwork);
    var providerName = route.provider ? route.provider.label : 'O provedor selecionado';
    var msg = providerName + ' não está disponível para ' + target + '.';
    if (route.compatible.length > 0) {
      msg += ' Disponível nesta rede: ' +
        route.compatible.map(function (p) { return p.label; }).join(', ') + '.';
    } else {
      msg += ' Nenhum provedor atende esta combinação no momento.';
    }
    return msg;
  }

  function describeMode(provider) {
    if (!provider) return '';
    if (provider.mode === 'manual') {
      return 'Cotação manual: informe o valor enviado e o valor recebido no ' + provider.label + '.';
    }
    if (provider.mode === 'cached') {
      return 'Cotação monitorada: os valores deste provedor são preenchidos automaticamente para comparação.';
    }
    return 'Informe os valores manualmente.';
  }

  function isAmbiguous(raw) {
    return AMBIGUOUS_THOUSANDS.test(String(raw || '').replace(/[\s\u00a0]/g, ''));
  }

  function setFieldMessage(input, msgEl, text, kind) {
    if (!input || !msgEl) return;
    input.classList.remove('calc-invalid', 'calc-warn');
    msgEl.classList.remove('calc-msg-error', 'calc-msg-warn');
    msgEl.textContent = text || '';
    if (text) {
      input.classList.add(kind === 'error' ? 'calc-invalid' : 'calc-warn');
      msgEl.classList.add(kind === 'error' ? 'calc-msg-error' : 'calc-msg-warn');
      input.setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function refreshAmbiguityHints() {
    if (!el.sentInput || !el.receivedInput) return false;
    var sentAmb = isAmbiguous(el.sentInput.value);
    var recvAmb = isAmbiguous(el.receivedInput.value);
    setFieldMessage(el.sentInput, el.sentMsg, sentAmb ? AMBIGUOUS_MESSAGE : '', 'warn');
    setFieldMessage(el.receivedInput, el.receivedMsg, recvAmb ? AMBIGUOUS_MESSAGE : '', 'warn');
    return sentAmb || recvAmb;
  }

  function hideResult() {
    if (el.resultBody) el.resultBody.hidden = true;
    if (el.resultEmpty) el.resultEmpty.hidden = false;
    if (el.comparisonSection) el.comparisonSection.hidden = true;
    lastManualCalculation = null;
  }

  function updateUnits() {
    if (!el.sendAsset || !el.receiveAsset) return;
    if (el.sentUnit) el.sentUnit.textContent = assetSymbol(el.sendAsset.value);
    if (el.receivedUnit) el.receivedUnit.textContent = assetSymbol(el.receiveAsset.value);
  }

  function updateState() {
    var sel = currentSelection();
    var route = evaluateRoute(sel);

    if (el.routeMsg && el.modeNote) {
      if (route.ok) {
        el.routeMsg.hidden = true;
        el.routeMsg.textContent = '';
        if (route.provider && route.provider.mode === 'manual') {
          el.modeNote.hidden = true;
          el.modeNote.textContent = '';
        } else {
          el.modeNote.hidden = false;
          el.modeNote.textContent = describeMode(route.provider);
        }
      } else {
        el.routeMsg.hidden = false;
        el.routeMsg.textContent = describeRouteProblem(sel, route);
        el.modeNote.hidden = true;
        el.modeNote.textContent = '';
      }
    }

    // Atualiza a descrição visual do bloco manual se o provedor for alterado
    if (el.manualDesc) {
      var provLabel = route.provider ? route.provider.label : 'Puro Swap';
      var netText = networkLabel(sel.receiveNetwork);
      el.manualDesc.textContent =
        'Informe a cotação recebida pelo ' + provLabel + ' (' + netText + ' · Modo ' +
        (route.provider && route.provider.badgeLabel ? route.provider.badgeLabel : 'Manual') + '):';
    }

    var ambiguous = refreshAmbiguityHints();
    if (el.submit) {
      el.submit.disabled = !route.ok || ambiguous;
    }
    return { route: route, ambiguous: ambiguous };
  }

  function onSendAssetChange() {
    fillSelect(el.sendNetwork, sideNetworkItems('send', el.sendAsset.value), catalog.defaults.sendNetwork);
    onSelectionChange();
  }

  function onReceiveAssetChange() {
    fillSelect(el.receiveNetwork, sideNetworkItems('receive', el.receiveAsset.value), catalog.defaults.receiveNetwork);
    onSelectionChange();
  }

  function onSelectionChange() {
    updateUnits();
    hideResult();
    updateState();
  }

  function onAmountInput() {
    hideResult();
    updateState();
  }

  // ----------------------------------------------------------------
  // Cálculo e Comparação
  // ----------------------------------------------------------------

  function onSubmit(event) {
    if (event) event.preventDefault();

    var state = updateState();
    if (!state.route.ok || state.ambiguous) {
      hideResult();
      return;
    }

    var validation = core.validateManualQuote({
      sent: el.sentInput.value,
      received: el.receivedInput.value,
    });

    if (!validation.valid) {
      validation.errors.forEach(function (err) {
        if (err.field === 'sent') setFieldMessage(el.sentInput, el.sentMsg, err.message, 'error');
        if (err.field === 'received') setFieldMessage(el.receivedInput, el.receivedMsg, err.message, 'error');
      });
      hideResult();
      var firstInvalid = validation.errors[0] && validation.errors[0].field === 'sent'
        ? el.sentInput : el.receivedInput;
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    var sel = currentSelection();
    var normalizeTo = catalog.defaults.normalizeTo || core.DEFAULT_NORMALIZE_TO;
    var effectiveRate = core.calculateEffectiveRate(validation.sentAmount, validation.receivedAmount);
    var normalized = core.normalizeQuote(validation.sentAmount, validation.receivedAmount, normalizeTo);

    if (effectiveRate === null || normalized === null) {
      hideResult();
      return;
    }

    lastManualCalculation = {
      valid: true,
      sentAmount: validation.sentAmount,
      receivedAmount: validation.receivedAmount,
      effectiveRate: effectiveRate,
    };

    renderResult(sel, state.route.provider, {
      sentAmount: validation.sentAmount,
      receivedAmount: validation.receivedAmount,
      effectiveRate: effectiveRate,
      normalizeTo: normalizeTo,
      normalized: normalized,
    });

    // Comparação & Ranking entre Puro Swap e SideShift
    var quotesToRank = buildQuotesForRanking(lastManualCalculation, sideShiftQuotes);
    var rankResult = core.rankQuotes(quotesToRank, {
      amount: validation.sentAmount,
      normalizeTo: normalizeTo,
    });
    renderComparisonTable(rankResult, validation.sentAmount);
  }

  function renderResult(sel, provider, r) {
    var sendSym = assetSymbol(sel.sendAsset);
    var recvSym = assetSymbol(sel.receiveAsset);

    clearChildren(el.context);
    var strong = document.createElement('strong');
    strong.textContent = provider ? provider.label : 'Puro Swap';
    el.context.appendChild(strong);
    el.context.appendChild(document.createTextNode(
      ' · ' + sendSym + ' (' + networkLabel(sel.sendNetwork) + ') → ' +
      recvSym + ' (' + networkLabel(sel.receiveNetwork) + ')'
    ));

    el.rateValue.textContent = formatRate(r.effectiveRate);
    el.rateValue.title = String(r.effectiveRate);
    el.rateUnit.textContent = recvSym + ' / ' + sendSym;

    el.realValue.textContent =
      formatNumber(r.sentAmount, 0, DISPLAY.inputMaxDecimals) + ' ' + sendSym + ' → ' +
      formatAmount(r.receivedAmount) + ' ' + recvSym;

    var normalizeLabel = formatNumber(r.normalizeTo, 0, DISPLAY.amountDecimals);
    el.normalizedValue.textContent =
      normalizeLabel + ' ' + sendSym + ' → ' +
      formatAmount(r.normalized) + ' ' + recvSym;
    el.normalizedValue.title = String(r.normalized) + ' ' + recvSym;

    el.disclaimer.textContent =
      'Referência de ' + normalizeLabel + ' ' + sendSym +
      ' baseada em proporção matemática. Taxas fixas do provedor podem fazer o valor real variar.';

    el.resultEmpty.hidden = true;
    el.resultBody.hidden = false;
  }

  function applyDefaults() {
    var d = catalog.defaults;
    fillSelect(el.sendAsset, sideAssetItems('send'), d.sendAsset);
    fillSelect(el.sendNetwork, sideNetworkItems('send', el.sendAsset.value), d.sendNetwork);
    fillSelect(el.receiveAsset, sideAssetItems('receive'), d.receiveAsset);
    fillSelect(el.receiveNetwork, sideNetworkItems('receive', el.receiveAsset.value), d.receiveNetwork);
    fillSelect(el.provider, providerList().map(function (p) {
      return { id: p.id, label: p.label };
    }), d.provider);
  }

  function onClear() {
    if (el.sentInput) el.sentInput.value = '';
    if (el.receivedInput) el.receivedInput.value = '';
    applyDefaults();
    setFieldMessage(el.sentInput, el.sentMsg, '', 'warn');
    setFieldMessage(el.receivedInput, el.receivedMsg, '', 'warn');
    onSelectionChange();
    if (el.sentInput) el.sentInput.focus();
  }

  // ----------------------------------------------------------------
  // Inicialização
  // ----------------------------------------------------------------

  function collectElements() {
    el = {
      section: $('calculator-section'),
      form: $('calc-form'),
      sendAsset: $('calc-send-asset'),
      sendNetwork: $('calc-send-network'),
      receiveAsset: $('calc-receive-asset'),
      receiveNetwork: $('calc-receive-network'),
      provider: $('calc-provider'),
      sentInput: $('calc-sent-amount'),
      receivedInput: $('calc-received-amount'),
      sentUnit: $('calc-sent-unit'),
      receivedUnit: $('calc-received-unit'),
      sentMsg: $('calc-sent-msg'),
      receivedMsg: $('calc-received-msg'),
      routeMsg: $('calc-route-msg'),
      modeNote: $('calc-mode-note'),
      manualDesc: $('calc-manual-desc'),
      submit: $('calc-submit'),
      clear: $('calc-clear'),
      resultEmpty: $('calc-result-empty'),
      resultBody: $('calc-result-body'),
      context: $('calc-context'),
      rateValue: $('calc-rate-value'),
      rateUnit: $('calc-rate-unit'),
      realValue: $('calc-real-value'),
      normalizedValue: $('calc-normalized-value'),
      disclaimer: $('calc-disclaimer'),
      layout: $('calc-layout'),
      unavailable: $('calc-unavailable'),
      // Cotações SideShift
      sideShiftCards: $('calc-sideshift-cards'),
      quotesStatus: $('calc-quotes-status'),
      refreshBtn: $('calc-refresh-quotes'),
      // Comparativo e Ranking
      comparisonSection: $('calc-comparison-section'),
      comparisonSubtitle: $('calc-comparison-subtitle'),
      comparisonTbody: $('calc-comparison-tbody'),
      bestBadge: $('calc-best-badge'),
      comparisonNote: $('calc-comparison-note'),
    };
    return !!el.section && !!el.form;
  }

  function showUnavailable() {
    if (el.layout) el.layout.hidden = true;
    if (el.unavailable) el.unavailable.hidden = false;
  }

  function init() {
    try {
      var hasElements = collectElements();
      if (!el.section) return;

      catalog = (typeof window !== 'undefined' && window.SwapCalculatorCatalog) || null;
      core = (typeof window !== 'undefined' && window.SwapCalculatorCore) || null;

      if (!hasElements || !catalog || !core) {
        showUnavailable();
        return;
      }

      var check = core.validateCatalog(catalog);
      if (!check.valid) {
        console.error('[CALCULADORA] catálogo inconsistente:', check.errors);
        showUnavailable();
        return;
      }

      applyDefaults();

      el.sendAsset.addEventListener('change', onSendAssetChange);
      el.receiveAsset.addEventListener('change', onReceiveAssetChange);
      el.sendNetwork.addEventListener('change', onSelectionChange);
      el.receiveNetwork.addEventListener('change', onSelectionChange);
      el.provider.addEventListener('change', onSelectionChange);
      el.sentInput.addEventListener('input', onAmountInput);
      el.receivedInput.addEventListener('input', onAmountInput);
      el.form.addEventListener('submit', onSubmit);
      el.clear.addEventListener('click', onClear);

      if (el.refreshBtn) {
        el.refreshBtn.addEventListener('click', refreshQuotes);
      }

      onSelectionChange();

      // Carrega cotações reais da SideShift uma única vez na inicialização
      refreshQuotes();
    } catch (err) {
      console.error('[CALCULADORA] erro ao inicializar:', err);
      showUnavailable();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return Object.freeze({
    loadSideShiftQuotes: loadSideShiftQuotes,
    buildQuotesForRanking: buildQuotesForRanking,
    getSideShiftNetworks: getSideShiftNetworks,
    SIDESHIFT_NETWORKS: getSideShiftNetworks(),
  });
});
