// src/dashboard/calculator-catalog.js
// ==================================================================
// CATÁLOGO CENTRAL DA CALCULADORA / COMPARADOR DE COTAÇÕES
// ==================================================================
//
// Este arquivo é a FONTE ÚNICA E CENTRALIZADA de configuração da calculadora.
// Todos os dropdowns, opções de ativos, redes, provedores e rotas são
// construídos dinamicamente pela interface a partir deste catálogo.
//
// NENHUM OUTRO ARQUIVO deve conter listas hardcoded de moedas, redes ou provedores.
//
// ------------------------------------------------------------------
// COMO ADICIONAR NOVAS OPÇÕES FUTURAMENTE:
// ------------------------------------------------------------------
//
// 1. NOVO ATIVO:
//    Adicione a definição em `assets`:
//      LBTC: { id: 'LBTC', label: 'L-BTC', symbol: 'LBTC', decimals: 8 },
//      BTC:  { id: 'BTC',  label: 'Bitcoin', symbol: 'BTC', decimals: 8 },
//    Em seguida, inclua o ativo nas opções de `send` (envio) e/ou `receive` (recebimento).
//
// 2. NOVA REDE:
//    Adicione a definição em `networks`:
//      arbitrum: { id: 'arbitrum', label: 'Arbitrum' },
//      polygon:  { id: 'polygon',  label: 'Polygon' },
//    Em seguida, associe a rede aos ativos em `send` e/ou `receive`, e registre
//    nas rotas dos provedores que a suportam.
//
// 3. NOVO PROVEDOR:
//    Adicione em `providers`:
//      novo_provedor: {
//        id: 'novo_provedor',
//        label: 'Nome do Provedor',
//        mode: 'manual' | 'cached' | 'live',
//        routes: {
//          'DEPIX:liquid>USDG': ['xlayer', 'ethereum'],
//        },
//      },
//    Modos suportados:
//      - 'manual': entrada de valores informada diretamente pelo usuário na calculadora.
//      - 'cached': lê automaticamente cotações armazenadas pelo monitor (somente leitura).
//      - 'live':   (futuro) integração via API backend dedicada da calculadora.
//
// 4. NOVA ROTA:
//    Chave de rota padronizada: `${sendAsset}:${sendNetwork}>${receiveAsset}`
//    Exemplo: 'DEPIX:liquid>USDG' ou 'LBTC:liquid>USDG'
//    Em cada provedor em `providers[id].routes`, liste as redes de recebimento suportadas.
//
// ------------------------------------------------------------------
// ISOLAMENTO E REGRAS DE ARQUITETURA:
//   - Este arquivo contém APENAS dados imutáveis (sem DOM, fetch, banco ou API).
//   - NÃO é lido pelo monitor automático nem altera o comportamento do SideShift existente.
//   - A ordem dos arrays define exatamente a ordem de exibição nos selects e cards.
// ==================================================================
(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = catalog;
  }
  if (root) {
    root.SwapCalculatorCatalog = catalog;
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      var value = obj[key];
      if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
  }

  var catalog = {
    version: 1,

    // ==============================================================
    // 1. ATIVOS CONHECIDOS (Ativos Atuais e Preparação Futura)
    // ==============================================================
    assets: {
      // Ativos atualmente ativos na interface:
      DEPIX: { id: 'DEPIX', label: 'DePix', symbol: 'DEPIX', decimals: 2 },
      USDG:  { id: 'USDG',  label: 'USDG',  symbol: 'USDG',  decimals: 4 },

      // Futura expansão (basta descomentar e incluir em `send` / `receive`):
      // LBTC: { id: 'LBTC', label: 'L-BTC',   symbol: 'LBTC', decimals: 8 },
      // BTC:  { id: 'BTC',  label: 'Bitcoin', symbol: 'BTC',  decimals: 8 },
    },

    // ==============================================================
    // 2. REDES CONHECIDAS
    // ==============================================================
    networks: {
      liquid:    { id: 'liquid',    label: 'Liquid' },
      xlayer:    { id: 'xlayer',    label: 'X Layer' },    // Puro Swap manual na calculadora
      ethereum:  { id: 'ethereum',  label: 'Ethereum' },
      solana:    { id: 'solana',    label: 'Solana' },
      robinhood: { id: 'robinhood', label: 'Robinhood' },

      // Futura expansão de redes:
      // arbitrum:  { id: 'arbitrum',  label: 'Arbitrum' },
      // optimism:  { id: 'optimism',  label: 'Optimism' },
      // polygon:   { id: 'polygon',   label: 'Polygon' },
    },

    // ==============================================================
    // 3. OPÇÕES DE ENVIO (Ordem define a listagem no dropdown)
    // ==============================================================
    send: [
      { asset: 'DEPIX', networks: ['liquid'] },
      // Futuramente:
      // { asset: 'LBTC', networks: ['liquid'] },
      // { asset: 'BTC',  networks: ['liquid'] },
    ],

    // ==============================================================
    // 4. OPÇÕES DE RECEBIMENTO (Ordem exata: X Layer, Ethereum, Solana, Robinhood)
    // ==============================================================
    receive: [
      {
        asset: 'USDG',
        networks: [
          'xlayer',    // 1. X Layer (Puro Swap)
          'ethereum',  // 2. Ethereum (SideShift)
          'solana',    // 3. Solana (SideShift)
          'robinhood', // 4. Robinhood (SideShift)
        ],
      },
    ],

    // ==============================================================
    // 5. PROVEDORES SUPORTADOS E SUAS ROTAS
    // ==============================================================
    providers: {
      // 1. SideShift (Modo cached: cotações em tempo real lidas do monitor)
      sideshift: {
        id: 'sideshift',
        label: 'SideShift',
        mode: 'cached',
        badgeLabel: 'MONITOR',
        monitorProviderId: 'sideshift',
        routes: {
          'DEPIX:liquid>USDG': ['ethereum', 'solana', 'robinhood'],
        },
      },

      // 2. Puro Swap (Modo manual: valores informados pelo usuário)
      puroswap: {
        id: 'puroswap',
        label: 'Puro Swap',
        mode: 'manual',
        badgeLabel: 'MANUAL',
        routes: {
          'DEPIX:liquid>USDG': ['xlayer'],
        },
      },

      // Futura expansão de provedores:
      // deflow: {
      //   id: 'deflow',
      //   label: 'DeFlow',
      //   mode: 'cached',
      //   badgeLabel: 'MONITOR',
      //   routes: { 'DEPIX:liquid>USDG': ['arbitrum'] },
      // },
    },

    // ==============================================================
    // 6. VALORES PADRÃO (Defaults ao abrir ou limpar a calculadora)
    // ==============================================================
    defaults: {
      sendAsset: 'DEPIX',
      sendNetwork: 'liquid',
      receiveAsset: 'USDG',
      receiveNetwork: 'xlayer',
      provider: 'puroswap',
      normalizeTo: 1000,
    },
  };

  return deepFreeze(catalog);
});
