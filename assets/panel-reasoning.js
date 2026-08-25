// panel-reasoning.js — fetch grids, render items, open reasoning trace on click
// runs at DOMContentLoaded

(() => {
  'use strict';

  const API = (path) => `${location.origin}${path}`;

  const GRIDS = ['RADAR', 'SIGNAL', 'TRACKER', 'PULSE'];

  // ------- meta line -------
  const meta = document.getElementById('meta-line');

  function setMeta(text) {
    if (meta) meta.textContent = text;
  }

  // ------- render items -------
  function confClass(c) {
    if (c >= 0.7) return 'conf';
    if (c >= 0.4) return 'conf';
    return 'conf-low';
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderItems(grid, items) {
    const list = document.getElementById(`grid-${grid}`);
    if (!list) return;
    if (!items || items.length === 0) {
      list.innerHTML = '<li class="empty" style="background:transparent;border:none;cursor:default"><span style="color:var(--muted);font-style:italic">Tidak ada item di grid ini untuk window saat ini.</span></li>';
      return;
    }
    list.innerHTML = items
      .map((it, i) => {
        const conf = typeof it.confidence === 'number' ? it.confidence : 0.5;
        const pub = it.published ? new Date(it.published).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `
        <li data-idx="${i}" data-title="${escapeHtml(it.title)}" data-url="${escapeHtml(it.url)}" data-summary="${escapeHtml(it.summary || '')}" data-source="${escapeHtml(it.source || '')}" data-grid="${grid}">
          <div class="it-title">${escapeHtml(it.title)}</div>
          ${it.blurb ? `<div class="it-blurb">${escapeHtml(it.blurb)}</div>` : ''}
          <div class="it-meta">
            <span>${escapeHtml((it.source || '').slice(0, 28))}</span>
            <span>·</span>
            <span class="${confClass(conf)}">conf ${Math.round(conf * 100)}%</span>
            ${pub ? `<span>·</span><span>${escapeHtml(pub)}</span>` : ''}
          </div>
        </li>`;
      })
      .join('');
  }

  // ------- fetch all grids -------
  async function loadFeed() {
    setMeta('memuat…');
    try {
      const r = await fetch(API('/api/feed.php'), { credentials: 'omit' });
      if (!r.ok) {
        setMeta(`gagal memuat feed (HTTP ${r.status})`);
        return;
      }
      const data = await r.json();
      for (const g of GRIDS) {
        renderItems(g, (data.grids || {})[g] || []);
      }
      const when = data.generated_at ? new Date(data.generated_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const ttl = data.ttl_hours || 24;
      const src = data.source_count || '?';
      setMeta(`update terakhir ${when} · window ${ttl} jam · ${src} sumber`);
    } catch (e) {
      console.error(e);
      setMeta('error: ' + e.message);
    }
  }

  // ------- reason panel -------
  const panel   = document.getElementById('reason-panel');
  const closeBtn = document.getElementById('reason-close');
  const titleEl  = document.getElementById('reason-title');
  const metaEl   = document.getElementById('reason-meta');
  const planEl   = document.getElementById('reason-plan');
  const stepsEl  = document.getElementById('reason-steps');
  const sourcesEl = document.getElementById('reason-sources');
  const summaryEl = document.getElementById('reason-summary');
  const confEl   = document.getElementById('reason-confidence');

  function showPanel() {
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function hidePanel() {
    panel.hidden = true;
    document.body.style.overflow = '';
  }
  closeBtn?.addEventListener('click', hidePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePanel();
  });

  function outcomeClass(o) {
    const s = (o || '').toLowerCase();
    if (s.includes('ok') || s.includes('confirm') || s.includes('setuju') || s.includes('cocok')) return 'ok';
    if (s.includes('tidak') || s.includes('tolak') || s.includes('gagal') || s.includes('beda') || s.includes('salah')) return 'no';
    if (s.includes('lemah') || s.includes('ragu') || s.includes('kurang') || s.includes('sebagian')) return 'weak';
    return 'unknown';
  }

  function renderTrace(trace, fallbackTitle, fallbackUrl) {
    titleEl.textContent = trace.item_title || fallbackTitle || '…';
    const srcList = (trace.sources || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li class="empty">tidak ada sumber tercatat</li>';
    const planList = (trace.plan || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('') || '<li class="empty">tidak ada plan</li>';
    const stepsList = (trace.steps || []).map((s) => `
      <li>
        <strong>${escapeHtml(s.action || '')}.</strong>
        ${escapeHtml(s.detail || '')}
        <span class="step-outcome ${outcomeClass(s.outcome)}">${escapeHtml(s.outcome || 'unknown')}</span>
      </li>`).join('') || '<li class="empty">tidak ada step</li>';

    metaEl.innerHTML = `
      <a href="${escapeHtml(trace.item_url || fallbackUrl || '#')}" target="_blank" rel="noopener noreferrer">buka sumber ↗</a>
      · model ${escapeHtml(trace.model || 'm3')}
      · ${(trace.steps || []).length} step
    `;
    planEl.innerHTML = planList;
    stepsEl.innerHTML = stepsList;
    sourcesEl.innerHTML = srcList;
    summaryEl.textContent = trace.summary || '—';
    const c = typeof trace.confidence === 'number' ? trace.confidence : 0;
    confEl.textContent = `${Math.round(c * 100)}%`;
    confEl.style.color = c >= 0.7 ? 'var(--lime)' : c >= 0.4 ? 'var(--amber)' : 'var(--coral)';
  }

  function showLoading(title, url) {
    titleEl.textContent = title;
    metaEl.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">buka sumber ↗</a> · <span class="reason-loading">bAIwor sedang mikir<span class="thinking-dots"></span></span>`;
    planEl.innerHTML = '';
    stepsEl.innerHTML = '<li class="reason-loading">menyusun rencana verifikasi…</li>';
    sourcesEl.innerHTML = '';
    summaryEl.textContent = '';
    confEl.textContent = '…';
    showPanel();
  }

  async function openItem(li) {
    const title = li.dataset.title;
    const url = li.dataset.url;
    const summary = li.dataset.summary;
    const source = li.dataset.source;
    const grid = li.dataset.grid;
    showLoading(title, url);
    try {
      const qs = new URLSearchParams({ title, url, summary, source, grid });
      const r = await fetch(API('/api/reason.php?' + qs.toString()), { credentials: 'omit' });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const trace = await r.json();
      renderTrace(trace, title, url);
    } catch (e) {
      console.error(e);
      stepsEl.innerHTML = `<li class="reason-loading" style="color:var(--coral)">gagal: ${escapeHtml(e.message)}</li>`;
    }
  }

  // delegate clicks on grid items
  document.addEventListener('click', (e) => {
    const li = e.target.closest('.grid-items li[data-idx]');
    if (li) openItem(li);
  });

  // boot
  loadFeed();
  // refresh every 5 min
  setInterval(loadFeed, 5 * 60 * 1000);
})();
