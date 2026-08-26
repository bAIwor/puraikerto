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
            ${it.provider ? `<span class="prov-badge">${escapeHtml(it.provider)}</span>` : ''}
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

  // ------- stale grid badge -------
  // A grid is "stale" when this run's curation failed and we carried over the
  // previous picks. Say so plainly rather than passing old data off as fresh.
  function markStale(grid, staleSince) {
    const list = document.getElementById(`grid-${grid}`);
    if (!list) return;
    const card = list.closest('.grid');
    if (!card) return;
    const head = card.querySelector('.grid-head');
    if (!head) return;

    const existing = head.querySelector('.stale-badge');
    if (!staleSince) {
      existing?.remove();
      return;
    }

    let ageText = '';
    const then = new Date(staleSince);
    if (!isNaN(then)) {
      const mins = Math.round((Date.now() - then.getTime()) / 60000);
      if (mins < 60) ageText = `${mins}m`;
      else if (mins < 1440) ageText = `${Math.round(mins / 60)}j`;
      else ageText = `${Math.round(mins / 1440)}h`;
    }
    const label = ageText ? `belum diperbarui · ${ageText}` : 'belum diperbarui';
    const title = `Kurasi terakhir gagal (sumber sedang sibuk). Item ini dibawa dari pembaruan sebelumnya${ageText ? `, ${ageText} lalu` : ''}.`;

    if (existing) {
      existing.textContent = label;
      existing.title = title;
    } else {
      const b = document.createElement('span');
      b.className = 'stale-badge';
      b.textContent = label;
      b.title = title;
      head.appendChild(b);
    }
  }

  // ------- status strip (Monitor surface header) -------
  const stLive = document.getElementById('st-live');
  const stLiveText = document.getElementById('st-live-text');
  const stUpd = document.getElementById('st-upd');
  const stItems = document.getElementById('st-items');
  const stSources = document.getElementById('st-sources');
  const stWindow = document.getElementById('st-window');
  const stWarn = document.getElementById('st-warn');

  function relTime(iso) {
    const t = new Date(iso);
    if (isNaN(t)) return '—';
    const mins = Math.round((Date.now() - t.getTime()) / 60000);
    if (mins < 1) return 'baru saja';
    if (mins < 60) return `${mins}m lalu`;
    if (mins < 1440) return `${Math.round(mins / 60)}j lalu`;
    return `${Math.round(mins / 1440)}h lalu`;
  }

  function setStatus(data, err) {
    if (!stLive) return;
    stLive.classList.remove('is-ok', 'is-warn', 'is-err');

    if (err) {
      stLive.classList.add('is-err');
      if (stLiveText) stLiveText.textContent = 'gagal';
      if (stWarn) { stWarn.hidden = false; stWarn.textContent = err; }
      return;
    }

    const staleCount = Object.keys(data.stale_grids || {}).length;
    if (staleCount > 0) {
      stLive.classList.add('is-warn');
      if (stLiveText) stLiveText.textContent = 'sebagian';
      if (stWarn) {
        stWarn.hidden = false;
        stWarn.textContent = `${staleCount} grid belum diperbarui`;
      }
    } else {
      stLive.classList.add('is-ok');
      if (stLiveText) stLiveText.textContent = 'aktif';
      if (stWarn) { stWarn.hidden = true; stWarn.textContent = ''; }
    }

    if (stUpd) {
      stUpd.textContent = data.generated_at ? relTime(data.generated_at) : '—';
      stUpd.title = data.generated_at
        ? new Date(data.generated_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
        : '';
    }
    const shown = GRIDS.reduce((n, g) => n + ((data.grids || {})[g] || []).length, 0);
    if (stItems) stItems.textContent = String(shown);
    if (stSources) stSources.textContent = String(data.source_count ?? '—');
    if (stWindow) stWindow.textContent = `${data.ttl_hours ?? 24}j`;
  }

  // ------- fetch all grids -------
  async function loadFeed() {
    try {
      const r = await fetch(API('/api/feed.php'), { credentials: 'omit' });
      if (!r.ok) {
        setStatus(null, `HTTP ${r.status}`);
        return;
      }
      const data = await r.json();
      const staleMap = data.stale_grids || {};
      for (const g of GRIDS) {
        renderItems(g, (data.grids || {})[g] || []);
        markStale(g, staleMap[g]);
      }
      setStatus(data, null);
    } catch (e) {
      console.error(e);
      setStatus(null, e.message || 'gagal memuat');
    }
  }

  function outcomeClass(o) {
    const s = (o || '').toLowerCase();
    if (s.includes('ok') || s.includes('confirm') || s.includes('setuju') || s.includes('cocok') || s.includes('valid') || s.includes('dikonfirmasi')) return 'ok';
    if (s.includes('tidak') || s.includes('tolak') || s.includes('gagal') || s.includes('beda') || s.includes('salah') || s.includes('batal')) return 'no';
    if (s.includes('lemah') || s.includes('ragu') || s.includes('kurang') || s.includes('sebagian') || s.includes('unknown') || s.includes('tidak yakin')) return 'unknown';
    return 'unknown';
  }

  function renderInlineTrace(container, trace, fallbackTitle, fallbackUrl) {
    const c = typeof trace.confidence === 'number' ? trace.confidence : 0;
    const pct = Math.round(c * 100);
    const tone = c >= 0.7 ? 'var(--lime)' : c >= 0.4 ? 'var(--amber)' : 'var(--coral)';

    const planList = (trace.plan || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('') || '<li class="empty">tidak ada plan</li>';
    const stepsList = (trace.steps || []).map((s) => `
      <li>
        <strong>${escapeHtml(s.action || '')}.</strong>
        ${escapeHtml(s.detail || '')}
        <span class="step-outcome ${outcomeClass(s.outcome)}">${escapeHtml(s.outcome || 'unknown')}</span>
      </li>`).join('') || '<li class="empty">tidak ada step</li>';
    const srcList = (trace.sources || []).map((s) => {
      const safe = escapeHtml(s);
      const isUrl = /^https?:\/\//i.test(s);
      return `<li>${isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe}</li>`;
    }).join('') || '<li class="empty">tidak ada sumber tercatat</li>';

    container.innerHTML = `
      <div class="inline-drawer-inner">
        <div class="inline-meta-bar">
          <a href="${escapeHtml(trace.item_url || fallbackUrl || '#')}" target="_blank" rel="noopener noreferrer" class="src-link" onclick="event.stopPropagation()">buka sumber asli ↗</a>
          <span>·</span>
          <span>model ${escapeHtml(trace.model || 'MiniMax-M3')}</span>
          <span>·</span>
          <span>${(trace.steps || []).length} langkah verifikasi</span>
        </div>

        <div class="reason-confidence">
          <span class="rc-label">Tingkat Keyakinan</span>
          <strong style="color:${tone}">${pct}%</strong>
          <span class="rc-bar" aria-hidden="true"><span class="rc-fill" style="width:${pct}%;background:${tone}"></span></span>
        </div>

        <section class="reason-block">
          <h4><span class="rb-num">1</span> Rencana</h4>
          <ol>${planList}</ol>
        </section>

        <section class="reason-block">
          <h4><span class="rb-num">2</span> Langkah & Hasil</h4>
          <ol>${stepsList}</ol>
        </section>

        <section class="reason-block">
          <h4><span class="rb-num">3</span> Sumber</h4>
          <ul>${srcList}</ul>
        </section>

        <section class="reason-block">
          <h4><span class="rb-num">4</span> Kesimpulan</h4>
          <p class="summary-text"></p>
        </section>
      </div>
    `;

    // Typewriter streaming effect for conclusion
    const sumEl = container.querySelector('.summary-text');
    if (sumEl) {
      streamTypeWriter(sumEl, trace.summary || '—', 8);
    }
  }

  function streamTypeWriter(element, fullText, speed = 8) {
    if (!fullText) {
      element.textContent = '—';
      return;
    }
    element.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    cursor.textContent = '▋';
    element.appendChild(cursor);

    let idx = 0;
    function typeNext() {
      if (!element.isConnected) return; // drawer was closed
      if (idx < fullText.length) {
        const chunk = fullText.slice(idx, idx + 3);
        element.insertBefore(document.createTextNode(chunk), cursor);
        idx += 3;
        setTimeout(typeNext, speed);
      } else {
        cursor.remove();
      }
    }
    typeNext();
  }

  async function openItem(li) {
    const isAlreadyOpen = li.classList.contains('is-open');

    // Close any other open items in any grid
    document.querySelectorAll('.grid-items li.is-open').forEach((el) => {
      el.classList.remove('is-open');
      const drawer = el.querySelector('.inline-reason-drawer');
      if (drawer) drawer.remove();
    });

    // If clicking the currently open item, toggle it closed
    if (isAlreadyOpen) return;

    li.classList.add('is-open');

    const title = li.dataset.title;
    const url = li.dataset.url;
    const summary = li.dataset.summary;
    const source = li.dataset.source;
    const grid = li.dataset.grid;

    // Create inline container inside the clicked li
    const drawer = document.createElement('div');
    drawer.className = 'inline-reason-drawer';
    drawer.innerHTML = `
      <div class="inline-drawer-inner">
        <div class="reason-loading">bAIwor sedang memeriksa & menyusun rencana verifikasi<span class="thinking-dots"></span></div>
      </div>
    `;
    li.appendChild(drawer);

    try {
      const qs = new URLSearchParams({ title, url, summary, source, grid });
      const r = await fetch(API('/api/reason.php?' + qs.toString()), { credentials: 'omit' });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const trace = await r.json();
      if (li.classList.contains('is-open')) {
        renderInlineTrace(drawer, trace, title, url);
      }
    } catch (e) {
      console.error(e);
      if (li.classList.contains('is-open')) {
        drawer.innerHTML = `<div class="inline-drawer-inner"><p class="reason-loading" style="color:var(--coral)">gagal: ${escapeHtml(e.message)}</p></div>`;
      }
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
