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
    // never clobber an open reading drawer mid-stream
    if (list.querySelector('.is-open')) return;
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
        <li data-idx="${i}" tabindex="0" role="button" aria-expanded="false" data-title="${escapeHtml(it.title)}" data-url="${escapeHtml(it.url)}" data-summary="${escapeHtml(it.summary || '')}" data-source="${escapeHtml(it.source || '')}" data-grid="${grid}" data-gridtag="${gridTag}">
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
    // don't blow away an open article mid-read
    if (list.querySelector('.article-card.is-open')) return;
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
        <div class="article-card" tabindex="0" role="button" aria-expanded="false" data-id="${escapeHtml(a.id)}" data-slug="${escapeHtml(a.slug)}">
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
  function renderFeedError(msg) {
    for (const g of GRIDS) {
      const list = document.getElementById(`grid-${g}`);
      if (!list || list.querySelector('.is-open')) continue;
      list.innerHTML = `<li class="empty-row" style="background:transparent;border:none;cursor:default"><span style="color:var(--muted);font-style:italic">Gagal memuat umpan (${escapeHtml(msg)}) — <a href="#" class="feed-retry" style="color:var(--lime);font-weight:700">coba lagi</a></span></li>`;
    }
  }

  async function loadFeed() {
    try {
      const r = await fetch(API('/api/feed.php'), { credentials: 'omit' });
      if (!r.ok) {
        setStatus(null, `HTTP ${r.status}`);
        renderFeedError(`HTTP ${r.status}`);
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
      renderFeedError(e.message || 'gagal memuat');
    }
  }

  function outcomeClass(o) {
    const s = (o || '').toLowerCase();
    if (s.includes('ok') || s.includes('confirm') || s.includes('setuju') || s.includes('cocok') || s.includes('valid') || s.includes('dikonfirmasi')) return 'ok';
    if (s.includes('tidak') || s.includes('tolak') || s.includes('gagal') || s.includes('beda') || s.includes('salah') || s.includes('batal')) return 'no';
    if (s.includes('lemah') || s.includes('ragu') || s.includes('kurang') || s.includes('sebagian') || s.includes('unknown') || s.includes('tidak yakin')) return 'unknown';
    return 'unknown';
  }

  function renderInlineTrace(drawer, trace, fallbackTitle, fallbackUrl) {
    const c = typeof trace.confidence === 'number' ? trace.confidence : 0;
    const targetPct = Math.round(c * 100);

    drawer.innerHTML = `
      <div class="inline-drawer-inner">
        <div class="inline-meta-bar">
          <a href="${escapeHtml(trace.item_url || fallbackUrl || '#')}" target="_blank" rel="noopener noreferrer" class="src-link" onclick="event.stopPropagation()">original source ↗</a>
          <span>·</span>
          <span>model ${escapeHtml(trace.model || 'MiniMax-M3')}</span>
          <span>·</span>
          <span>${(trace.steps || []).length} steps</span>
          <button type="button" class="drawer-skip-btn" aria-label="Tampilkan semua tanpa animasi">⚡ Skip animasi</button>
          <button type="button" class="drawer-close-btn" aria-label="Close accordion">✕ Close</button>
        </div>

        <div class="reason-confidence">
          <span class="rc-label">Verification Confidence</span>
          <strong class="rc-num">0%</strong>
          <span class="rc-bar" aria-hidden="true"><span class="rc-fill" style="width:0%"></span></span>
        </div>

        <section class="reason-block block-plan">
          <h4>Verification Plan</h4>
          <ol class="typewriter-plan-list"></ol>
        </section>

        <section class="reason-block block-steps">
          <h4>Execution &amp; Verification Steps</h4>
          <ol class="typewriter-steps-list"></ol>
        </section>

        <section class="reason-block block-sources">
          <h4>Referenced Sources</h4>
          <ul class="typewriter-sources-list"></ul>
        </section>

        <section class="reason-block block-conclusion">
          <h4>bAIwor Assessment</h4>
          <p class="summary-text"></p>
        </section>
      </div>
    `;

    const fillEl = drawer.querySelector('.rc-fill');
    const numEl = drawer.querySelector('.rc-num');
    const planOl = drawer.querySelector('.typewriter-plan-list');
    const stepsOl = drawer.querySelector('.typewriter-steps-list');
    const sourcesUl = drawer.querySelector('.typewriter-sources-list');
    const sumEl = drawer.querySelector('.summary-text');

    let isSkipped = false;
    let countInterval = null;

    const skipBtn = drawer.querySelector('.drawer-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isSkipped = true;
        skipBtn.hidden = true;
        if (countInterval) clearInterval(countInterval);
        renderInstant();
      });
    }

    // readers who opt out of motion get the content immediately
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      skipBtn?.remove();
      renderInstant();
      return;
    }

    // Full Instant Render (fallback / on skip)
    function renderInstant() {
      if (fillEl) fillEl.style.width = `${targetPct}%`;
      if (numEl) numEl.textContent = `${targetPct}%`;

      if (planOl) {
        planOl.innerHTML = (trace.plan || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('') || '<li class="empty">no plan recorded</li>';
      }
      if (stepsOl) {
        stepsOl.innerHTML = (trace.steps || []).map((s) => `
          <li>
            <strong>${escapeHtml(s.action || '')}.</strong>
            <span class="step-detail-text">${escapeHtml(s.detail || '')}</span>
            <span class="step-outcome step-outcome-pop ${outcomeClass(s.outcome)}">${escapeHtml(s.outcome || 'unknown')}</span>
          </li>`).join('') || '<li class="empty">no steps recorded</li>';
      }
      if (sourcesUl) {
        sourcesUl.innerHTML = (trace.sources || []).map((s) => {
          const safe = escapeHtml(s);
          const isUrl = /^https?:\/\//i.test(s);
          return `<li>${isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe}</li>`;
        }).join('') || '<li class="empty">no sources cited</li>';
      }
      if (sumEl) {
        sumEl.textContent = trace.summary || '—';
      }
    }

    // Human-like Sequential Typewriter Streaming
    async function runFullSequence() {
      // 1. Animate Confidence counter & bar smoothly
      if (fillEl) fillEl.style.width = `${targetPct}%`;
      let currentVal = 0;
      countInterval = setInterval(() => {
        if (currentVal < targetPct) {
          currentVal = Math.min(targetPct, currentVal + Math.ceil(targetPct / 15) || 1);
          if (numEl) numEl.textContent = `${currentVal}%`;
        } else {
          if (numEl) numEl.textContent = `${targetPct}%`;
          clearInterval(countInterval);
        }
      }, 25);

      // 2. Stream Plans with human typing cadence
      const plans = trace.plan || [];
      for (const p of plans) {
        if (isSkipped || !drawer.isConnected) return;
        const li = document.createElement('li');
        planOl.appendChild(li);
        await typeIntoElement(li, p, 18);
        await sleep(60);
      }

      // 3. Stream Steps with human typing cadence
      const steps = trace.steps || [];
      for (const s of steps) {
        if (isSkipped || !drawer.isConnected) return;
        const li = document.createElement('li');
        const actionStr = s.action ? `${s.action}. ` : '';
        const detailStr = s.detail || '';
        li.innerHTML = `<strong>${escapeHtml(actionStr)}</strong><span class="step-txt"></span>`;
        stepsOl.appendChild(li);

        const txtSpan = li.querySelector('.step-txt');
        await typeIntoElement(txtSpan, detailStr, 15);

        // Pop badge after step detail finishes
        if (!isSkipped && drawer.isConnected) {
          const badge = document.createElement('span');
          badge.className = `step-outcome step-outcome-pop ${outcomeClass(s.outcome)}`;
          badge.textContent = s.outcome || 'unknown';
          li.appendChild(badge);
          await sleep(100);
        }
      }

      // 4. Render Sources smoothly
      if (sourcesUl && !isSkipped && drawer.isConnected) {
        const sources = trace.sources || [];
        for (const s of sources) {
          if (isSkipped || !drawer.isConnected) return;
          const li = document.createElement('li');
          const safe = escapeHtml(s);
          const isUrl = /^https?:\/\//i.test(s);
          li.innerHTML = isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe;
          sourcesUl.appendChild(li);
          await sleep(60);
        }
      }

      // 5. Stream Conclusion with human typing cadence
      if (sumEl && !isSkipped && drawer.isConnected) {
        await typeIntoElement(sumEl, trace.summary || '—', 18);
      }
    }

    function typeIntoElement(el, text, baseSpeed = 18) {
      return new Promise((resolve) => {
        let i = 0;
        const cursor = document.createElement('span');
        cursor.className = 'type-cursor';
        cursor.textContent = '▋';
        el.appendChild(cursor);

        function tick() {
          if (isSkipped || !drawer.isConnected) {
            cursor.remove();
            el.textContent = text;
            resolve();
            return;
          }
          if (i < text.length) {
            const char = text[i];
            el.insertBefore(document.createTextNode(char), cursor);
            i++;

            // Natural human typing rhythm (slight pauses at punctuation)
            let delay = baseSpeed;
            if (char === '.' || char === '?' || char === '!') delay = baseSpeed * 3.5;
            else if (char === ',' || char === ';' || char === ':') delay = baseSpeed * 2;
            else if (char === ' ') delay = baseSpeed * 1.2;

            setTimeout(tick, delay);
          } else {
            cursor.remove();
            resolve();
          }
        }
        tick();
      });
    }

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    // Start human typewriter sequence
    runFullSequence();
  }

  // last item/card opened, so Escape can return focus to it
  let lastActivated = null;

  function closeAllDrawers() {
    document.querySelectorAll('.grid-items li.is-open').forEach((el) => {
      el.classList.remove('is-open');
      el.setAttribute('aria-expanded', 'false');
      const oldDrawer = el.querySelector('.inline-reason-drawer');
      if (oldDrawer) {
        oldDrawer.classList.remove('is-expanded');
        setTimeout(() => oldDrawer.remove(), 250);
      }
    });
    document.querySelectorAll('.article-card.is-open').forEach((el) => {
      el.classList.remove('is-open');
      el.setAttribute('aria-expanded', 'false');
      const oldDrawer = el.querySelector('.article-inline-drawer');
      if (oldDrawer) {
        oldDrawer.classList.remove('is-expanded');
        setTimeout(() => oldDrawer.remove(), 250);
      }
    });
  }

  async function openItem(li) {
    const isAlreadyOpen = li.classList.contains('is-open');

    // Close any currently open items smoothly
    closeAllDrawers();

    // If clicking currently open item, it collapses (toggle close)
    if (isAlreadyOpen) return;

    li.classList.add('is-open');
    li.setAttribute('aria-expanded', 'true');
    lastActivated = li;

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
        <div class="reason-loading" style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">
          &gt; bAIwor engine: memuat data & menyusun verifikasi rencana<span class="type-cursor">▋</span>
        </div>
      </div>
    `;
    li.appendChild(drawer);

    // Trigger smooth accordion expansion
    requestAnimationFrame(() => {
      drawer.classList.add('is-expanded');
    });

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
        drawer.innerHTML = `
          <div class="inline-drawer-inner">
            <p class="reason-loading" style="color:var(--coral);font-family:var(--font-mono);font-size:11px;">
              [!] gagal: ${escapeHtml(e.message)}
            </p>
          </div>
        `;
      }
    }
  }

  // ------- article accordion inline -------
  async function openArticle(card) {
    const isAlreadyOpen = card.classList.contains('is-open');

    // Close any other open items
    closeAllDrawers();

    // If clicking currently open card, it collapses (toggle close)
    if (isAlreadyOpen) return;

    card.classList.add('is-open');
    card.setAttribute('aria-expanded', 'true');
    lastActivated = card;

    const id = card.dataset.id;
    const slug = card.dataset.slug;
    const qs = new URLSearchParams();
    if (id) qs.set('id', id);
    else if (slug) qs.set('slug', slug);

    // Create inline container inside the clicked card
    const drawer = document.createElement('div');
    drawer.className = 'article-inline-drawer';
    drawer.innerHTML = `
      <div class="inline-drawer-inner">
        <div class="reason-loading" style="font-family:var(--font-mono);font-size:11px;color:var(--lime);">
          &gt; bAIwor: memuat isi artikel lengkap & verifikasi rujukan<span class="type-cursor">▋</span>
        </div>
      </div>
    `;
    card.appendChild(drawer);

    // Trigger smooth accordion expansion
    requestAnimationFrame(() => {
      drawer.classList.add('is-expanded');
    });

    try {
      const r = await fetch(API('/api/article.php?' + qs.toString()), { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const a = await r.json();

      if (!card.classList.contains('is-open')) return;

      const date = a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      const targetConf = typeof a.confidence === 'number' ? Math.round(a.confidence * 100) : 75;

      let currentLang = 'en';
      let isArticleSkipped = false;
      let instantArticle = false;

      function getParagraphs(lang) {
        const text = (lang === 'id' && a.body_id) ? a.body_id : (a.body || a.summary || '');
        return text.split(/\n\n+/).filter(p => p.trim());
      }

      drawer.innerHTML = `
        <div class="inline-drawer-inner">
          <div class="inline-meta-bar">
            <span>by ${escapeHtml(a.author || 'bAIwor')}</span>
            ${date ? `<span>·</span><span>${date}</span>` : ''}
            <span>·</span>
            <span>${a.read_minutes || 3} min read</span>
            ${a.grid_origin ? `<span>·</span><span class="src">from grid ${escapeHtml(a.grid_origin)}</span>` : ''}
            ${a.body_id ? `<button type="button" class="article-trans-btn" aria-label="Translate to Indonesian">🌐 Terjemahkan ke Bahasa Indonesia</button>` : ''}
            <button type="button" class="article-skip-btn" aria-label="Tampilkan semua tanpa animasi">⚡ Skip animasi</button>
            <button type="button" class="drawer-close-btn" aria-label="Close accordion">✕ Close</button>
          </div>

          <div class="reason-confidence">
            <span class="rc-label">Verification Confidence</span>
            <strong class="article-rc-num">0%</strong>
            <span class="rc-bar" aria-hidden="true"><span class="article-rc-fill" style="width:0%"></span></span>
          </div>

          <div class="article-body-stream"></div>

          <section class="reason-block">
            <h4>Referenced Sources</h4>
            <ul class="article-sources-stream"></ul>
          </section>
        </div>
      `;

      const fillEl = drawer.querySelector('.article-rc-fill');
      const numEl = drawer.querySelector('.article-rc-num');
      const bodyEl = drawer.querySelector('.article-body-stream');
      const sourcesEl = drawer.querySelector('.article-sources-stream');
      const transBtn = drawer.querySelector('.article-trans-btn');
      const skipBtn = drawer.querySelector('.article-skip-btn');
      const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      if (transBtn) {
        transBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          isArticleSkipped = true;
          currentLang = (currentLang === 'en') ? 'id' : 'en';
          transBtn.textContent = (currentLang === 'id') ? '🌐 Show Original (English)' : '🌐 Terjemahkan ke Bahasa Indonesia';
          bodyEl.innerHTML = '';
          setTimeout(() => {
            isArticleSkipped = false;
            streamArticle(getParagraphs(currentLang));
          }, 30);
        });
      }

      if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          instantArticle = true;
          skipBtn.hidden = true;
        });
      }

      function renderSources() {
        if (!sourcesEl || !drawer.isConnected) return;
        sourcesEl.innerHTML = (a.sources || []).map(s => {
          const safe = escapeHtml(s);
          const isUrl = /^https?:\/\//i.test(s);
          return `<li>${isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe}</li>`;
        }).join('') || '<li class="empty">no sources cited</li>';
      }

      function renderAllParagraphs(paragraphs) {
        bodyEl.insertAdjacentHTML('beforeend', paragraphs
          .map(p => `<div style="margin-bottom:14px;line-height:1.7;font-size:14px;color:var(--fg)">${md(p)}</div>`)
          .join(''));
      }

      // 1. Animate confidence (instant for reduced motion)
      if (fillEl) fillEl.style.width = `${targetConf}%`;
      if (prefersReduced) {
        if (numEl) numEl.textContent = `${targetConf}%`;
      } else {
        let curConf = 0;
        const confTimer = setInterval(() => {
          if (curConf < targetConf) {
            curConf = Math.min(targetConf, curConf + Math.ceil(targetConf / 15) || 1);
            if (numEl) numEl.textContent = `${curConf}%`;
          } else {
            if (numEl) numEl.textContent = `${targetConf}%`;
            clearInterval(confTimer);
          }
        }, 25);
      }

      // 2. Stream article paragraphs with human typewriter rhythm
      async function streamArticle(paragraphs) {
        for (let i = 0; i < paragraphs.length; i++) {
          const p = paragraphs[i];
          if (isArticleSkipped || !drawer.isConnected) return;
          if (instantArticle) {
            // finish the rest instantly without duplicating typed paragraphs
            const done = Math.max(i, bodyEl.children.length);
            renderAllParagraphs(paragraphs.slice(done));
            renderSources();
            if (skipBtn) skipBtn.hidden = true;
            return;
          }
          const pEl = document.createElement('div');
          pEl.style.marginBottom = '14px';
          pEl.style.lineHeight = '1.7';
          pEl.style.fontSize = '14px';
          pEl.style.color = 'var(--fg)';
          bodyEl.appendChild(pEl);

          // Type paragraph text
          const cursor = document.createElement('span');
          cursor.className = 'type-cursor';
          cursor.textContent = '▋';
          pEl.appendChild(cursor);

          let j = 0;
          await new Promise((resolve) => {
            function tick() {
              if (isArticleSkipped || instantArticle || !drawer.isConnected) {
                cursor.remove();
                pEl.innerHTML = md(p);
                resolve();
                return;
              }
              if (j < p.length) {
                const char = p[j];
                pEl.insertBefore(document.createTextNode(char), cursor);
                j++;
                let delay = 14;
                if (char === '.' || char === '?' || char === '!') delay = 32;
                else if (char === ',' || char === ':') delay = 22;
                setTimeout(tick, delay);
              } else {
                cursor.remove();
                pEl.innerHTML = md(p);
                resolve();
              }
            }
            tick();
          });

          await new Promise((r) => setTimeout(r, 60));
        }

        renderSources();
      }

      if (prefersReduced) {
        instantArticle = true;
        if (skipBtn) skipBtn.hidden = true;
      }

      streamArticle(getParagraphs(currentLang));

    } catch (e) {
      console.error(e);
      if (card.classList.contains('is-open')) {
        drawer.innerHTML = `
          <div class="inline-drawer-inner">
            <p class="reason-loading" style="color:var(--coral);font-family:var(--font-mono);font-size:11px;">
              [!] gagal: ${escapeHtml(e.message)}
            </p>
          </div>
        `;
      }
    }
  }

  // delegate clicks
  document.addEventListener('click', (e) => {
    // If selecting text (e.g. dragging to copy), don't trigger click close
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;

    // If clicking explicit close button
    if (e.target.closest('.drawer-close-btn')) {
      closeAllDrawers();
      return;
    }

    // Manual retry from a feed-error row
    const retryLink = e.target.closest('.feed-retry');
    if (retryLink) {
      e.preventDefault();
      loadFeed();
      return;
    }

    // If clicking an external link, let it open normally
    if (e.target.closest('a')) return;

    // Clicks inside an open drawer (links & close handled above)
    // must not collapse the reading surface
    if (e.target.closest('.inline-reason-drawer, .article-inline-drawer')) return;

    const li = e.target.closest('.grid-items li[data-idx]');
    if (li) {
      openItem(li);
      return;
    }

    const ac = e.target.closest('.article-card[data-id], .article-card[data-slug]');
    if (ac) {
      openArticle(ac);
      return;
    }

    // Clicking anywhere outside any open item -> close all open accordions!
    closeAllDrawers();
  });

  // keyboard: Enter/Space opens a focused item, Escape closes any open drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.grid-items li.is-open, .article-card.is-open');
      if (open) {
        closeAllDrawers();
        lastActivated?.focus({ preventScroll: true });
      }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!(e.target instanceof Element)) return;
    const li = e.target.closest('.grid-items li[data-idx]');
    if (e.target === li) {
      e.preventDefault();
      openItem(li);
      return;
    }
    const ac = e.target.closest('.article-card[data-id], .article-card[data-slug]');
    if (e.target === ac) {
      e.preventDefault();
      openArticle(ac);
    }
  });

  // boot
  loadFeed();
  loadArticles();
  // refresh every 5 min
  setInterval(loadFeed, 5 * 60 * 1000);
  setInterval(loadArticles, 5 * 60 * 1000);
})();
