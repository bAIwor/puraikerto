// panel-reasoning.js — fetch grids, render items, open reasoning trace on click
// also handles article list + article view panel
// runs at DOMContentLoaded

(() => {
  'use strict';

  const API = (path) => `${location.origin}${path}`;
  const escapeHtml = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  // very small markdown for article body (headings, bold, italic, links, lists, code)
  function md(s) {
    if (!s) return '';
    let h = escapeHtml(s);
    h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      // only allow http(s) schemes — prevent javascript:, data:, etc.
      if (/^https?:\/\//i.test(url)) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return `${text} (${url})`;
    });
    h = h.replace(/(^|\n)- (.+)/g, '$1<li>$2</li>');
    h = h.replace(/(<li>[^<]+<\/li>)(?:\s*<li>)/g, '$1');
    h = h.replace(/(?:<li>[^<]+<\/li>)+/g, (m) => `<ul>${m}</ul>`);
    h = h.split(/\n{2,}/).map(p => /^<(h\d|ul|pre)/.test(p) ? p : `<p>${p}</p>`).join('\n');
    return h;
  }

  // ------- theme toggle -------
  const themeBtn = document.getElementById('theme-toggle');
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyThemeIcon() {
    if (themeBtn) themeBtn.textContent = currentTheme() === 'light' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('puraikerto-theme', next); } catch (e) { /* ignore, e.g. private mode */ }
    applyThemeIcon();
  }
  themeBtn?.addEventListener('click', toggleTheme);
  applyThemeIcon();

  // ------- meta line -------
  const meta = document.getElementById('meta-line');
  function setMeta(text) { if (meta) meta.textContent = text; }

  // ------- grid items -------
  const GRIDS = ['RADAR', 'SIGNAL', 'TRACKER', 'PULSE'];
  function confClass(c) {
    if (c >= 0.7) return 'conf-high';
    if (c >= 0.4) return 'conf';
    return 'conf-low';
  }

  function renderItems(grid, items) {
    const list = document.getElementById(`grid-${grid}`);
    if (!list) return;
    if (!items || items.length === 0) {
      list.innerHTML = '<li class="empty-row" style="background:transparent;border:none;cursor:default"><span style="color:var(--muted);font-style:italic">Tidak ada item di grid ini untuk window saat ini.</span></li>';
      return;
    }
    list.innerHTML = items
      .map((it, i) => {
        const conf = typeof it.confidence === 'number' ? it.confidence : 0.5;
        const pub = it.published ? new Date(it.published).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const gridTag = grid.toLowerCase();
        return `
        <li data-idx="${i}" data-title="${escapeHtml(it.title)}" data-url="${escapeHtml(it.url)}" data-summary="${escapeHtml(it.summary || '')}" data-source="${escapeHtml(it.source || '')}" data-grid="${grid}" data-gridtag="${gridTag}">
          <div class="it-title">${escapeHtml(it.title)}</div>
          ${it.blurb ? `<div class="it-blurb">${escapeHtml(it.blurb)}</div>` : ''}
          <div class="it-meta">
            <span class="src">${escapeHtml((it.source || '').slice(0, 28))}</span>
            <span>·</span>
            <span class="${confClass(conf)}">conf ${Math.round(conf * 100)}%</span>
            ${pub ? `<span>·</span><span>${escapeHtml(pub)}</span>` : ''}
          </div>
        </li>`;
      })
      .join('');
  }

  // ------- articles -------
  async function loadArticles() {
    const list = document.getElementById('article-list');
    if (!list) return;
    try {
      const r = await fetch(API('/api/article.php'), { credentials: 'omit' });
      if (!r.ok) {
        list.innerHTML = '<p class="empty">Belum ada artikel. Akan segera hadir.</p>';
        return;
      }
      const data = await r.json();
      const arts = data.articles || [];
      if (arts.length === 0) {
        list.innerHTML = '<p class="empty">Belum ada artikel. Akan segera hadir.</p>';
        return;
      }
      list.innerHTML = arts.map(a => {
        const date = a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        return `
        <div class="article-card" data-id="${escapeHtml(a.id)}" data-slug="${escapeHtml(a.slug)}">
          <span class="grid-tag tag-${escapeHtml(a.grid_origin || '').toLowerCase()}">${escapeHtml(a.grid_origin || 'bAIwor')}</span>
          <h3>${escapeHtml(a.title)}</h3>
          <p>${escapeHtml(a.summary)}</p>
          <div class="by">
            <span>oleh ${escapeHtml(a.author || 'bAIwor')}</span>
            <span>·</span>
            <span>${date}</span>
            <span>·</span>
            <span>${a.read_minutes || 3} min baca</span>
            ${a.confidence ? `<span>·</span><span>conf ${Math.round(a.confidence * 100)}%</span>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('articles:', e);
      list.innerHTML = '<p class="empty">Gagal memuat artikel.</p>';
    }
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
  const panel = document.getElementById('reason-panel');
  const closeBtn = document.getElementById('reason-close');
  const titleEl = document.getElementById('reason-title');
  const metaEl = document.getElementById('reason-meta');
  const planEl = document.getElementById('reason-plan');
  const stepsEl = document.getElementById('reason-steps');
  const sourcesEl = document.getElementById('reason-sources');
  const summaryEl = document.getElementById('reason-summary');
  const confEl = document.getElementById('reason-confidence');

  function showPanel() {
    if (panel) { panel.hidden = false; document.body.style.overflow = 'hidden'; }
  }
  function hidePanel() {
    if (panel) { panel.hidden = true; }
    const ap = document.getElementById('article-panel');
    if (ap) ap.hidden = true;
    document.body.style.overflow = '';
  }
  closeBtn?.addEventListener('click', hidePanel);
  document.getElementById('article-close')?.addEventListener('click', hidePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePanel();
  });

  function outcomeClass(o) {
    const s = (o || '').toLowerCase();
    if (s.includes('ok') || s.includes('confirm') || s.includes('setuju') || s.includes('cocok') || s.includes('valid') || s.includes('dikonfirmasi')) return 'ok';
    if (s.includes('tidak') || s.includes('tolak') || s.includes('gagal') || s.includes('beda') || s.includes('salah') || s.includes('batal')) return 'no';
    if (s.includes('lemah') || s.includes('ragu') || s.includes('kurang') || s.includes('sebagian') || s.includes('unknown') || s.includes('tidak yakin')) return 'unknown';
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

  // ------- article panel -------
  const ap = document.getElementById('article-panel');
  const atitle = document.getElementById('article-title');
  const ameta = document.getElementById('article-meta');
  const abody = document.getElementById('article-body');
  const asources = document.getElementById('article-sources');
  const aconf = document.getElementById('article-confidence');

  async function openArticle(card) {
    const id = card.dataset.id;
    const slug = card.dataset.slug;
    const qs = new URLSearchParams();
    if (id) qs.set('id', id);
    else if (slug) qs.set('slug', slug);
    atitle.textContent = '…';
    ameta.textContent = '';
    abody.innerHTML = '<p class="reason-loading">memuat artikel<span class="thinking-dots"></span></p>';
    asources.innerHTML = '';
    aconf.textContent = '…';
    ap.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const r = await fetch(API('/api/article.php?' + qs.toString()), { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const a = await r.json();
      atitle.textContent = a.title || '(tanpa judul)';
      const date = a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      ameta.innerHTML = `
        <span>oleh ${escapeHtml(a.author || 'bAIwor')}</span>
        ${date ? `<span> · </span><span>${date}</span>` : ''}
        <span> · </span><span>${a.read_minutes || 3} min baca</span>
        ${a.grid_origin ? `<span> · </span><span class="src">dari grid ${escapeHtml(a.grid_origin)}</span>` : ''}
      `;
      abody.innerHTML = md(a.body || a.summary || '');
      asources.innerHTML = (a.sources || []).map(s => {
        const safe = escapeHtml(s);
        const isUrl = /^https?:\/\//i.test(s);
        return `<li>${isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>` : safe}</li>`;
      }).join('') || '<li class="empty">tidak ada sumber</li>';
      const c = typeof a.confidence === 'number' ? a.confidence : 0;
      aconf.textContent = `${Math.round(c * 100)}%`;
      aconf.style.color = c >= 0.7 ? 'var(--lime)' : c >= 0.4 ? 'var(--amber)' : 'var(--coral)';
    } catch (e) {
      console.error(e);
      abody.innerHTML = `<p class="reason-loading" style="color:var(--coral)">gagal: ${escapeHtml(e.message)}</p>`;
    }
  }

  // delegate clicks
  document.addEventListener('click', (e) => {
    const li = e.target.closest('.grid-items li[data-idx]');
    if (li) { openItem(li); return; }
    const ac = e.target.closest('.article-card[data-id], .article-card[data-slug]');
    if (ac) openArticle(ac);
  });

  // boot
  loadFeed();
  loadArticles();
  // refresh every 5 min
  setInterval(loadFeed, 5 * 60 * 1000);
  setInterval(loadArticles, 5 * 60 * 1000);
})();
