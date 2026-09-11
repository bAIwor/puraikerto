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

  function formatItemTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const mon = months[d.getMonth()] || '';
    const hr = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${mon} · ${hr}:${min} WIB`;
  }

  // PULSE: sumber (Lapak Aduan) mengirim judul huruf besar semua —
  // tampilkan sentence case agar selaras dengan grid lain (data asli tak diubah)
  function pulseSentenceCase(title) {
    const m = String(title).match(/^\[([^\]]+)\]\s*(.*)$/s);
    if (!m) return String(title);
    const body = m[2];
    return `[${m[1]}] ${body.charAt(0).toUpperCase()}${body.slice(1).toLowerCase()}`;
  }

  function renderItems(grid, items) {
    const list = document.getElementById(`grid-${grid}`);
    if (!list) return;
    const displayTitle = (grid === 'PULSE') ? pulseSentenceCase : (t) => t;
    if (!items || items.length === 0) {
      list.innerHTML = '<li class="empty-row" style="background:transparent;border:none;cursor:default"><span style="color:var(--muted);font-style:italic">Tidak ada item di grid ini untuk window saat ini.</span></li>';
      return;
    }
    list.innerHTML = items
      .map((it, i) => {
        const conf = typeof it.confidence === 'number' ? it.confidence : 0.5;
        const pub = formatItemTime(it.published);
        const gridTag = grid.toLowerCase();
        const srcText = (it.source || '').slice(0, 36);
        const title = displayTitle(it.title);
        return `
        <li data-idx="${i}" data-title="${escapeHtml(it.title)}" data-url="${escapeHtml(it.url)}" data-summary="${escapeHtml(it.summary || '')}" data-source="${escapeHtml(it.source || '')}" data-grid="${grid}" data-gridtag="${gridTag}">
          <div class="it-title">${escapeHtml(title)}</div>
          ${it.blurb ? `<div class="it-blurb">${escapeHtml(it.blurb)}</div>` : ''}
          <div class="it-meta">
            <span class="src">${escapeHtml(srcText)}</span>
            ${pub ? `<span>·</span><span>${escapeHtml(pub)}</span>` : ''}
            <span>·</span>
            <span class="${confClass(conf)}">conf ${Math.round(conf * 100)}%</span>
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

  function getUrgensiClass(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('sangat mendesak')) return 'urgensi-sangat-mendesak';
    if (l.includes('mendesak')) return 'urgensi-mendesak';
    if (l.includes('strategis')) return 'urgensi-strategis';
    if (l.includes('signifikan')) return 'urgensi-signifikan';
    return '';
  }

  function renderInlineTrace(drawer, trace, fallbackTitle, fallbackUrl) {
    const c = typeof trace.confidence === 'number' ? trace.confidence : 0.8;
    const targetPct = Math.round(c * 100);
    const urgensiLabel = trace.urgensi_label || (targetPct >= 85 ? 'Sangat Mendesak' : (targetPct >= 70 ? 'Mendesak' : 'Strategis'));
    const urgClass = getUrgensiClass(urgensiLabel);
    const isIde1 = !!(trace.tldr || (trace.pihak_terkait && trace.pihak_terkait.length) || (trace.dampak_warga && trace.dampak_warga.length) || (trace.rekomendasi && trace.rekomendasi.length));

    function typeIntoElement(el, text, baseSpeed = 12) {
      return new Promise((resolve) => {
        let i = 0;
        const cursor = document.createElement('span');
        cursor.className = 'type-cursor';
        cursor.textContent = '▋';
        el.appendChild(cursor);

        function tick() {
          if (!drawer.isConnected) {
            cursor.remove();
            el.textContent = text;
            resolve();
            return;
          }
          if (i < text.length) {
            const char = text[i];
            el.insertBefore(document.createTextNode(char), cursor);
            i++;

            let delay = baseSpeed;
            if (char === '.' || char === '?' || char === '!') delay = baseSpeed * 2.8;
            else if (char === ',' || char === ';' || char === ':') delay = baseSpeed * 1.6;
            else if (char === ' ') delay = baseSpeed * 1.1;

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

    if (isIde1) {
      drawer.innerHTML = `
        <div class="inline-drawer-inner">
          <div class="inline-meta-bar">
            <a href="${escapeHtml(trace.item_url || fallbackUrl || '#')}" target="_blank" rel="noopener noreferrer" class="src-link" onclick="event.stopPropagation()">sumber asli ↗</a>
            <span>·</span>
            <span>model ${escapeHtml(trace.model || 'bAIwor (MiniMax-M3)')}</span>
            <span>·</span>
            <span class="meta-urgensi ${urgClass}">${escapeHtml(urgensiLabel)}</span>
            <button type="button" class="drawer-close-btn" aria-label="Tutup accordion">✕ Tutup</button>
          </div>

          <div class="reason-confidence">
            <span class="rc-label">Tingkat Urgensi / Signifikansi Dampak</span>
            <strong class="rc-num">0%</strong>
            <span class="rc-bar" aria-hidden="true"><span class="rc-fill" style="width:0%"></span></span>
          </div>

          <!-- 1. Inti Masalah / TL;DR -->
          <section class="reason-block block-tldr">
            <h4>📌 Inti Masalah &amp; Situasi</h4>
            <p class="tldr-text"></p>
          </section>

          <!-- 2. Pihak Terkait & Kewenangan -->
          ${(trace.pihak_terkait && trace.pihak_terkait.length) ? `
          <section class="reason-block block-pihak">
            <h4>🏛️ Pihak Terkait &amp; Kewenangan (${trace.pihak_terkait.length} Instansi)</h4>
            <div class="pihak-list"></div>
          </section>` : ''}

          <!-- 3. Dampak ke Warga & Wilayah -->
          ${(trace.dampak_warga && trace.dampak_warga.length) ? `
          <section class="reason-block block-dampak">
            <h4>👥 Dampak ke Masyarakat &amp; Wilayah</h4>
            <ul class="dampak-list"></ul>
          </section>` : ''}

          <!-- 4. Rekomendasi Solusi bAIwor -->
          ${(trace.rekomendasi && trace.rekomendasi.length) ? `
          <section class="reason-block block-rekomendasi">
            <h4>⚡ Rekomendasi &amp; Solusi bAIwor</h4>
            <ol class="rekomendasi-list"></ol>
          </section>` : ''}

          <!-- 5. Catatan Strategis bAIwor -->
          ${trace.summary ? `
          <section class="reason-block block-conclusion">
            <h4>📋 Catatan Strategis bAIwor</h4>
            <p class="summary-text"></p>
          </section>` : ''}
        </div>
      `;

      const fillEl = drawer.querySelector('.rc-fill');
      const numEl = drawer.querySelector('.rc-num');
      const tldrEl = drawer.querySelector('.tldr-text');
      const pihakContainer = drawer.querySelector('.pihak-list');
      const dampakUl = drawer.querySelector('.dampak-list');
      const rekomOl = drawer.querySelector('.rekomendasi-list');
      const sumEl = drawer.querySelector('.summary-text');
      const closeBtn = drawer.querySelector('.drawer-close-btn');

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeAllDrawers();
        });
      }

      async function runSequenceIde1() {
        // 1. Animate Urgensi counter & bar smoothly
        if (fillEl) fillEl.style.width = `${targetPct}%`;
        let currentVal = 0;
        const countInterval = setInterval(() => {
          if (currentVal < targetPct) {
            currentVal = Math.min(targetPct, currentVal + Math.ceil(targetPct / 15) || 1);
            if (numEl) numEl.textContent = `${currentVal}%`;
          } else {
            if (numEl) numEl.textContent = `${targetPct}%`;
            clearInterval(countInterval);
          }
        }, 20);

        // 2. Stream TL;DR with typing effect
        if (tldrEl) {
          const tldrContent = trace.tldr || trace.summary || '—';
          await typeIntoElement(tldrEl, tldrContent, 10);
          await sleep(40);
        }

        // 3. Render Pihak Terkait cards
        if (pihakContainer && drawer.isConnected) {
          const pihak = trace.pihak_terkait || [];
          for (const p of pihak) {
            if (!drawer.isConnected) return;
            const card = document.createElement('div');
            card.className = 'pihak-card';
            card.innerHTML = `
              <div class="pihak-instansi">🏛️ ${escapeHtml(p.instansi || '')}</div>
              <div class="pihak-peran">${escapeHtml(p.peran || '')}</div>
            `;
            pihakContainer.appendChild(card);
            await sleep(60);
          }
        }

        // 4. Render Dampak ke Warga items
        if (dampakUl && drawer.isConnected) {
          const dampak = trace.dampak_warga || [];
          for (const d of dampak) {
            if (!drawer.isConnected) return;
            const li = document.createElement('li');
            li.innerHTML = `<span class="dampak-icon">⚠️</span> <span>${escapeHtml(d)}</span>`;
            dampakUl.appendChild(li);
            await sleep(50);
          }
        }

        // 5. Render Rekomendasi Solusi bAIwor
        if (rekomOl && drawer.isConnected) {
          const rekom = trace.rekomendasi || [];
          for (let i = 0; i < rekom.length; i++) {
            if (!drawer.isConnected) return;
            const li = document.createElement('li');
            li.innerHTML = `<strong>Langkah ${i + 1}</strong> <span>${escapeHtml(rekom[i])}</span>`;
            rekomOl.appendChild(li);
            await sleep(60);
          }
        }

        // 6. Stream Summary / Catatan Akhir
        if (sumEl && drawer.isConnected) {
          await typeIntoElement(sumEl, trace.summary || '—', 8);
        }
      }

      runSequenceIde1();
      return;
    }

    // Fallback: Legacy trace rendering (if older plan & steps format)
    drawer.innerHTML = `
      <div class="inline-drawer-inner">
        <div class="inline-meta-bar">
          <a href="${escapeHtml(trace.item_url || fallbackUrl || '#')}" target="_blank" rel="noopener noreferrer" class="src-link" onclick="event.stopPropagation()">sumber asli ↗</a>
          <span>·</span>
          <span>model ${escapeHtml(trace.model || 'MiniMax-M3')}</span>
          <span>·</span>
          <span>${(trace.steps || []).length} steps</span>
          <button type="button" class="drawer-close-btn" aria-label="Tutup accordion">✕ Tutup</button>
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
    const closeBtn = drawer.querySelector('.drawer-close-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDrawers();
      });
    }

    async function runLegacySequence() {
      if (fillEl) fillEl.style.width = `${targetPct}%`;
      let currentVal = 0;
      const countInterval = setInterval(() => {
        if (currentVal < targetPct) {
          currentVal = Math.min(targetPct, currentVal + Math.ceil(targetPct / 15) || 1);
          if (numEl) numEl.textContent = `${currentVal}%`;
        } else {
          if (numEl) numEl.textContent = `${targetPct}%`;
          clearInterval(countInterval);
        }
      }, 25);

      const plans = trace.plan || [];
      for (const p of plans) {
        if (!drawer.isConnected) return;
        const li = document.createElement('li');
        planOl.appendChild(li);
        await typeIntoElement(li, p, 15);
        await sleep(50);
      }

      const steps = trace.steps || [];
      for (const s of steps) {
        if (!drawer.isConnected) return;
        const li = document.createElement('li');
        const actionStr = s.action ? `${s.action}. ` : '';
        const detailStr = s.detail || '';
        li.innerHTML = `<strong>${escapeHtml(actionStr)}</strong><span class="step-txt"></span>`;
        stepsOl.appendChild(li);

        const txtSpan = li.querySelector('.step-txt');
        await typeIntoElement(txtSpan, detailStr, 12);

        if (drawer.isConnected) {
          const badge = document.createElement('span');
          badge.className = `step-outcome step-outcome-pop ${outcomeClass(s.outcome)}`;
          badge.textContent = s.outcome || 'unknown';
          li.appendChild(badge);
          await sleep(80);
        }
      }

      if (sourcesUl && drawer.isConnected) {
        const sources = trace.sources || [];
        for (const s of sources) {
          if (!drawer.isConnected) return;
          const li = document.createElement('li');
          const safe = escapeHtml(s);
          const isUrl = /^https?:\/\//i.test(s);
          li.innerHTML = isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe;
          sourcesUl.appendChild(li);
          await sleep(50);
        }
      }

      if (sumEl && drawer.isConnected) {
        await typeIntoElement(sumEl, trace.summary || '—', 15);
      }
    }

    runLegacySequence();
  }

  function closeAllDrawers() {
    document.querySelectorAll('.grid-items li.is-open').forEach((el) => {
      el.classList.remove('is-open');
      const oldDrawer = el.querySelector('.inline-reason-drawer');
      if (oldDrawer) {
        oldDrawer.classList.remove('is-expanded');
        setTimeout(() => oldDrawer.remove(), 250);
      }
    });
    document.querySelectorAll('.article-card.is-open').forEach((el) => {
      el.classList.remove('is-open');
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
          &gt; bAIwor engine: memuat analisis kebijakan &amp; dampak warga<span class="type-cursor">▋</span>
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

      // 1. Animate confidence
      if (fillEl) fillEl.style.width = `${targetConf}%`;
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

      // 2. Stream article paragraphs with human typewriter rhythm
      async function streamArticle(paragraphs) {
        for (const p of paragraphs) {
          if (isArticleSkipped || !drawer.isConnected) return;
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

          let i = 0;
          await new Promise((resolve) => {
            function tick() {
              if (isArticleSkipped || !drawer.isConnected) {
                cursor.remove();
                pEl.innerHTML = md(p);
                resolve();
                return;
              }
              if (i < p.length) {
                const char = p[i];
                pEl.insertBefore(document.createTextNode(char), cursor);
                i++;
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

        // Render sources
        if (!isArticleSkipped && drawer.isConnected && sourcesEl) {
          sourcesEl.innerHTML = (a.sources || []).map(s => {
            const safe = escapeHtml(s);
            const isUrl = /^https?:\/\//i.test(s);
            return `<li>${isUrl ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe} ↗</a>` : safe}</li>`;
          }).join('') || '<li class="empty">no sources cited</li>';
        }
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

    // If clicking an external link, let it open normally
    if (e.target.closest('a')) return;

    // If clicking explicit close button
    if (e.target.closest('.drawer-close-btn')) {
      closeAllDrawers();
      return;
    }

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

  // boot
  loadFeed();
  loadArticles();
  // refresh every 5 min
  setInterval(loadFeed, 5 * 60 * 1000);
  setInterval(loadArticles, 5 * 60 * 1000);
})();
