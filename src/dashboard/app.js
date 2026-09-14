// src/dashboard/app.js
'use strict';

const API = '';        // mesma origem
let chartInstance = null;
let currentHours = 1;
let quoteInterval = 300; // segundos, atualizado via /api/config
let countdownTimer = null;
let secondsLeft = 300;
let comparisonData = null;
let targetCurrency = 'USDC';
let sourceCurrency = 'DEPIX';

// ── Formatação ────────────────────────────────────────────

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtRate(n) {
  if (n == null) return '—';
  return Number(n).toFixed(6);
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}%`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function providerLabel(name) {
  const labels = { sideshift: 'SideShift', deflow: 'DeFlow' };
  return labels[name] ?? name;
}

// ── Toast ─────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderLeftColor = type === 'error' ? 'var(--red)' : 'var(--accent)';
  el.style.borderLeftWidth = '3px';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Score ─────────────────────────────────────────────────

function scoreEmoji(score) {
  if (score == null) return '—';
  if (score <= 30) return '🔴';
  if (score <= 45) return '🟠';
  if (score <= 60) return '🟡';
  if (score <= 80) return '🟢';
  return '🟢🟢';
}

function scoreColor(score) {
  if (score == null) return 'var(--text-muted)';
  if (score <= 30) return 'var(--red)';
  if (score <= 45) return 'var(--orange)';
  if (score <= 60) return 'var(--yellow)';
  return 'var(--green)';
}

// ── Renderização de cards ──────────────────────────────────

function renderCard(providerData, isBest) {
  const { provider, latest_quoted_amount, effective_rate,
          average_1h, average_6h, average_24h,
          best_24h, worst_24h,
          difference_vs_average_24h, difference_vs_best_24h,
          score, count } = providerData;

  const name = providerLabel(provider);

  // Status
  let statusClass = 'badge-unknown';
  let statusLabel = 'Desconhecido';

  if (score && latest_quoted_amount != null) {
    statusClass = 'badge-online';
    statusLabel = 'Online';
  } else if (score === null && count === 0) {
    statusClass = 'badge-pending';
    statusLabel = 'Pendente';
  } else {
    statusClass = 'badge-error';
    statusLabel = 'Indisponível';
  }

  // Se o provider é DeFlow e não há dados — detecta suspension pelo erro
  const isDeflowSuspended = provider === 'deflow' && (count === 0 || latest_quoted_amount == null);
  const isSuspended = isDeflowSuspended; // futuro: checar campo status retornado pela API

  // Ajusta badge para suspenso
  if (isSuspended) {
    statusClass = 'badge-suspended';
    statusLabel = 'Suspenso';
  }

  const cardClass = [
    'provider-card',
    isBest && latest_quoted_amount != null ? 'best' : '',
    statusLabel === 'Indisponível' ? 'error-state' : '',
    isSuspended ? 'suspended-state' : '',
  ].filter(Boolean).join(' ');

  const scoreObj = score || {};
  const scoreVal = scoreObj.score;
  const scoreLabel = scoreObj.label || '—';
  const scoreDesc = scoreObj.description || '';

  const pctVsAvg = difference_vs_average_24h;
  const pctClass = pctVsAvg == null ? 'muted' : pctVsAvg >= 0 ? 'positive' : 'negative';

  const mainContent = isSuspended
    ? `<div class="suspended-message">
        ⏸️ <strong>Swap suspensa temporariamente</strong><br>
        A DeFlow suspendeu a funcionalidade de swap.<br>
        O monitor aguardará a reativação automaticamente.
       </div>`
    : latest_quoted_amount == null
    ? `<div class="error-message">❌ Sem cotação disponível</div>`
    : `
      <div class="card-main-amount">
        <div class="amount-label">1.000 ${sourceCurrency}</div>
        <div class="amount-value">
          ${fmt(latest_quoted_amount)}<span class="amount-currency">${targetCurrency}</span>
        </div>
        <div class="amount-rate monospace">Rate: ${fmtRate(effective_rate || (latest_quoted_amount / 1000))}</div>
      </div>
      <div class="card-divider"></div>
      <div class="card-stats">
        <div class="stat-item">
          <span class="stat-label">Média 1h</span>
          <span class="stat-value">${fmt(average_1h)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Média 6h</span>
          <span class="stat-value">${fmt(average_6h)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Média 24h</span>
          <span class="stat-value">${fmt(average_24h)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Melhor 24h</span>
          <span class="stat-value">${fmt(best_24h)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">vs Média 24h</span>
          <span class="stat-value ${pctClass}">${fmtPct(pctVsAvg)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">vs Melhor 24h</span>
          <span class="stat-value ${difference_vs_best_24h >= 0 ? 'positive' : 'negative'}">${fmtPct(difference_vs_best_24h)}</span>
        </div>
      </div>
      <div class="score-row">
        <div>
          <div class="score-label">Score de oportunidade</div>
          <div class="score-tag">${scoreLabel}</div>
        </div>
        <div style="text-align:right">
          <div class="score-value" style="color:${scoreColor(scoreVal)}">${scoreEmoji(scoreVal)} ${scoreVal ?? '—'}</div>
        </div>
      </div>
    `;

  return `
    <div class="${cardClass}">
      <div class="card-header">
        <div class="provider-name">${name}</div>
        <span class="provider-badge ${statusClass}">${statusLabel}</span>
      </div>
      ${mainContent}
    </div>
  `;
}

// ── Renderização do banner ──────────────────────────────────

function renderBestBanner(comparison) {
  const banner = document.getElementById('best-banner');
  if (!comparison || !comparison.best_provider) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  document.getElementById('best-provider-name').textContent =
    providerLabel(comparison.best_provider);
  document.getElementById('best-provider-amount').textContent =
    `${fmt(comparison.best_quoted_amount)} ${targetCurrency}`;

  const diffSection = document.getElementById('best-diff-section');
  if (comparison.provider_difference_pct != null && comparison.second_provider) {
    diffSection.style.display = 'block';
    document.getElementById('best-diff-value').textContent =
      `+${Number(comparison.provider_difference_pct).toFixed(2)}%`;
    document.getElementById('best-diff-label').textContent =
      `vs ${providerLabel(comparison.second_provider)}`;
  } else {
    diffSection.style.display = 'none';
  }
}

// ── Fetch comparação ────────────────────────────────────────

async function fetchComparison() {
  try {
    const res = await fetch(`${API}/api/comparison`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    comparisonData = data;

    const bestProvider = data.comparison?.best_provider;
    renderBestBanner(data.comparison);

    // Renderizar cards
    const grid = document.getElementById('cards-grid');
    grid.innerHTML = (data.providers || [])
      .map((p) => renderCard(p, p.provider === bestProvider))
      .join('');

    // Header status
    document.getElementById('status-dot').style.background = 'var(--green)';
    document.getElementById('status-text').textContent = 'online';
    document.getElementById('last-updated').textContent = fmtTime(data.timestamp);

  } catch (err) {
    console.error('Erro ao buscar comparação:', err);
    document.getElementById('status-dot').style.background = 'var(--red)';
    document.getElementById('status-text').textContent = 'erro de conexão';
    showToast('Erro ao buscar cotações: ' + err.message, 'error');
  }
}

// ── Fetch histórico (tabela) ────────────────────────────────

async function fetchHistoryTable() {
  try {
    const res = await fetch(`${API}/api/quotes/history?hours=24&limit=30`);
    const data = await res.json();
    const rows = data.history || [];

    // Agrupa por timestamp (arredondado para minuto)
    const byMinute = {};
    for (const r of rows) {
      const key = r.observed_at ? r.observed_at.substring(0, 16) : 'unknown';
      if (!byMinute[key]) byMinute[key] = {};
      byMinute[key][r.provider] = r;
    }

    const sorted = Object.entries(byMinute).sort(([a], [b]) => b.localeCompare(a)).slice(0, 20);

    const tbody = document.getElementById('history-tbody');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted-cell" style="text-align:center;padding:24px">Aguardando dados...</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(([ts, providers]) => {
      const ss = providers['sideshift'];
      const df = providers['deflow'];
      const ssAmt = ss?.quoted_amount;
      const dfAmt = df?.quoted_amount;

      let best = '—';
      let ssCls = '', dfCls = '';
      if (ssAmt != null && dfAmt != null) {
        if (ssAmt > dfAmt) { best = 'SideShift'; ssCls = 'best-cell'; }
        else if (dfAmt > ssAmt) { best = 'DeFlow'; dfCls = 'best-cell'; }
        else { best = 'Igual'; ssCls = dfCls = 'best-cell'; }
      } else if (ssAmt != null) { best = 'SideShift'; ssCls = 'best-cell'; }
      else if (dfAmt != null)   { best = 'DeFlow';    dfCls = 'best-cell'; }

      return `<tr>
        <td>${fmtTime(ts + ':00Z')}</td>
        <td class="${ssCls}">${fmt(ssAmt)}</td>
        <td class="${dfCls}">${dfAmt != null ? fmt(dfAmt) : '<span class="muted-cell">—</span>'}</td>
        <td class="best-cell">${best}</td>
      </tr>`;
    }).join('');

  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
  }
}

// ── Gráfico Chart.js ────────────────────────────────────────

async function fetchAndRenderChart(hours) {
  try {
    const res = await fetch(`${API}/api/quotes/history?hours=${hours}`);
    const data = await res.json();
    const rows = data.history || [];

    const ssPoints = rows.filter(r => r.provider === 'sideshift' && r.quoted_amount != null)
      .map(r => ({ x: new Date(r.observed_at), y: r.quoted_amount })).reverse();
    const dfPoints = rows.filter(r => r.provider === 'deflow' && r.quoted_amount != null)
      .map(r => ({ x: new Date(r.observed_at), y: r.quoted_amount })).reverse();

    const chartEmpty = document.getElementById('chart-empty');
    const canvas = document.getElementById('quoteChart');

    if (ssPoints.length === 0 && dfPoints.length === 0) {
      canvas.style.display = 'none';
      chartEmpty.style.display = 'flex';
      return;
    }

    canvas.style.display = 'block';
    chartEmpty.style.display = 'none';

    const chartData = {
      datasets: [
        {
          label: 'SideShift',
          data: ssPoints,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'DeFlow',
          data: dfPoints,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    if (chartInstance) {
      chartInstance.data = chartData;
      chartInstance.update();
    } else {
      chartInstance = new Chart(document.getElementById('quoteChart'), {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: {
                color: '#94a3b8',
                usePointStyle: true,
                font: { family: 'Inter', size: 12 },
              },
            },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: 'rgba(255,255,255,0.07)',
              borderWidth: 1,
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)} ${targetCurrency}`,
              },
            },
          },
          scales: {
            x: {
              type: 'time',
              time: { tooltipFormat: 'HH:mm' },
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { color: '#475569', font: { size: 11 } },
            },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: '#475569',
                font: { size: 11, family: 'JetBrains Mono' },
                callback: (v) => fmt(v),
              },
            },
          },
        },
      });
    }
  } catch (err) {
    console.error('Erro no gráfico:', err);
  }
}

// ── Config ──────────────────────────────────────────────────

async function loadConfig() {
  try {
    const res = await fetch(`${API}/api/config`);
    const data = await res.json();
    quoteInterval = data.quoteIntervalSeconds ?? 300;

    if (data.mockMode) {
      document.getElementById('mock-badge').style.display = 'inline-block';
    }
  } catch (e) { /* silent */ }
}

// ── Countdown ───────────────────────────────────────────────

function startCountdown() {
  secondsLeft = quoteInterval;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secondsLeft--;
    const el = document.getElementById('countdown');
    if (el) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    if (secondsLeft <= 0) {
      clearInterval(countdownTimer);
      refreshAll();
    }
  }, 1000);
}

// ── Refresh ──────────────────────────────────────────────────

async function refreshAll() {
  await Promise.all([
    fetchComparison(),
    fetchHistoryTable(),
    fetchAndRenderChart(currentHours),
  ]);
  startCountdown();
}

// ── Tema claro/escuro ─────────────────────────────────────

const THEME_KEY = 'swap-monitor-theme';

function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem(THEME_KEY, theme);

  // Atualiza cores do gráfico Chart.js ao trocar tema
  if (chartInstance) {
    const textColor = theme === 'dark' ? '#475569' : '#94a3b8';
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    chartInstance.options.scales.x.ticks.color = textColor;
    chartInstance.options.scales.y.ticks.color = textColor;
    chartInstance.options.scales.x.grid.color = gridColor;
    chartInstance.options.scales.y.grid.color = gridColor;
    chartInstance.options.plugins.legend.labels.color = theme === 'dark' ? '#94a3b8' : '#475569';
    chartInstance.options.plugins.tooltip.backgroundColor = theme === 'dark' ? '#111827' : '#ffffff';
    chartInstance.options.plugins.tooltip.titleColor = theme === 'dark' ? '#f1f5f9' : '#0f172a';
    chartInstance.options.plugins.tooltip.bodyColor = theme === 'dark' ? '#94a3b8' : '#475569';
    chartInstance.options.plugins.tooltip.borderColor = theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    chartInstance.update('none');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  // Respeita preferência do sistema se não houver salvo
  const preferred = saved ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(preferred);
}



async function loadConfig() {
  try {
    const res = await fetch(`${API}/api/config`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.quoteIntervalSeconds) {
      quoteInterval = data.quoteIntervalSeconds;
      secondsLeft = quoteInterval;
    }
    if (data.swap?.destination?.asset) {
      targetCurrency = data.swap.destination.asset;
      sourceCurrency = data.swap.source?.asset || 'DEPIX';
      const sub = document.querySelector('.logo-sub');
      if (sub) {
        sub.textContent = `${data.swap.source.asset} (${data.swap.source.network}) → ${data.swap.destination.asset} (${data.swap.destination.network})`;
      }
      const th1 = document.querySelector('thead tr th:nth-child(2)');
      if (th1) th1.textContent = `SideShift (${targetCurrency})`;
      const th2 = document.querySelector('thead tr th:nth-child(3)');
      if (th2) th2.textContent = `DeFlow (${targetCurrency})`;
    }
    const mockBadge = document.getElementById('mock-badge');
    if (mockBadge) {
      mockBadge.style.display = data.mockMode ? 'inline-block' : 'none';
    }
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Tema: inicializa e conecta botão
  initTheme();
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Botões de tempo do gráfico
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentHours = parseInt(btn.dataset.hours);
      fetchAndRenderChart(currentHours);
    });
  });

  await loadConfig();
  await refreshAll();
});

