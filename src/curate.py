"""
curate.py — Purwokerto curation engine (v2)

Architecture:
- Each grid has its own sources
- RADAR:   Berita Utama Pemkab Banyumas (banyumaskab.go.id AJAX API)
- SIGNAL:  national Google News queries (3)
- TRACKER: local Google News queries per institution (9)
- PULSE:   Radar Banyumas RSS (1) — no AI filter, general news

Flow:
1. Fetch sources per grid
2. For SIGNAL/TRACKER: filter AI-related items
   For RADAR/PULSE: no AI filter (raw berita Banyumas)
3. Ask M3 to pick 9 items per grid
4. Detect provider mentions for badges
5. Write to api/cache_feed.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import feedparser
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

from gmi_client import GMIClient, ChatMessage, GMIError
from sources import (
    SIGNAL_FEEDS,
    SIGNAL_QUERIES,
    TRACKER_QUERIES,
    PROVIDERS,
    PEMKAB_API_URL,
    PEMKAB_KATEGORI,
    PEMKAB_MAX_ITEMS,
    LAPAK_ADUAN_URL,
    GRID_RADAR,
    GRID_SIGNAL,
    GRID_TRACKER,
    GRID_PULSE,
    GRIDS,
    detect_provider,
)
from google_news import fetch_gn

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("purwokerto.curate")

WIB = timezone(timedelta(hours=7))

GRID_ITEMS_COUNT = 9

GRID_PROMPTS = {
    GRID_RADAR: (
        f"Pilih {GRID_ITEMS_COUNT} item PALING BARU dan PALING PENTING untuk grid RADAR. "
        "RADAR = berita utama terkini dari Pemerintah Kabupaten Banyumas. "
        "Fokus pada: kebijakan bupati, program pembangunan, layanan publik, kegiatan pemkab. "
        "Hindari yang terlalu seremonial atau tidak berdampak luas."
    ),
    GRID_SIGNAL: (
        f"Pilih {GRID_ITEMS_COUNT} berita PALING PENTING dan HANGAT seputar Banyumas Raya untuk grid SIGNAL. "
        "SIGNAL = KABAR PERISTIWA & MEDIA LOKAL BANYUMAS. "
        "Fokus pada: peristiwa penting, dinamika masyarakat, transportasi, ekonomi lokal, cuaca/bencana, dan info publik. "
        "Hindari berita clickbait atau kriminal sensasional tanpa konteks. Utamakan yang menyangkut kepentingan publik."
    ),
    GRID_TRACKER: (
        f"Pilih {GRID_ITEMS_COUNT} kabar PALING DINAMIS dan INSPIRATIF dari dunia kampus/pendidikan Purwokerto untuk grid TRACKER. "
        "TRACKER = DINAMIKA KAMPUS & PENDIDIKAN PURWOKERTO (Unsoed, UMP, Amikom, Telkom, UIN Saizu, dll). "
        "Fokus pada: inovasi riset, kegiatan mahasiswa, prestasi akademik, pengabdian masyarakat, agenda kampus. "
        "Utamakan yang berdampak positif bagi kemajuan daerah dan generasi muda."
    ),
    GRID_PULSE: (
        f"Pilih {GRID_ITEMS_COUNT} aduan PALING MENDESAK dan PALING MENARIK dari warga Banyumas untuk grid PULSE. "
        "PULSE = SUARA & LAPAK ADUAN WARGA BANYUMAS. "
        "Fokus pada: aduan infrastruktur (jalan rusak, jembatan), transportasi, fasilitas publik, lingkungan, bansos. "
        "Pilih aduan yang mewakili keluhan nyata masyarakat sehari-hari. "
        "Tuliskan blurb ringkas dan reason mengapa aduan ini penting diperhatikan Pemkab."
    ),
}


def _strip_html(text: str) -> str:
    """Remove HTML tags and normalize whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_pemkab_berita(
    kategori: str = PEMKAB_KATEGORI,
    max_items: int = PEMKAB_MAX_ITEMS,
) -> list[dict]:
    """
    Fetch Berita Utama dari API Pemkab Banyumas.
    POST https://banyumaskab.go.id/berita/get_data_berita
    Returns list of {title, url, source, summary, published}.
    """
    items = []
    try:
        resp = requests.post(
            PEMKAB_API_URL,
            data={
                "kategori": kategori,
                "draw": 1,
                "start": 0,
                "length": max_items,
            },
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": "https://banyumaskab.go.id/berita",
                "User-Agent": "Mozilla/5.0 (compatible; PurwokertoCurator/1.0)",
            },
            timeout=15,
            verify=False,  # SSL cert Pemkab kadang bermasalah
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning("fetch_pemkab_berita failed: %s", e)
        return []

    records = data.get("data", [])
    log.info("fetch_pemkab_berita: got %d records (kategori=%s)", len(records), kategori)

    now_wib = datetime.now(WIB).isoformat()
    for rec in records:
        title   = (rec.get("title") or "").strip()
        item_id = rec.get("id", "")
        # URL artikel langsung ke pemkab
        url     = f"https://banyumaskab.go.id/berita/{item_id}" if item_id else ""
        isi_raw = rec.get("isi") or rec.get("isi_rows") or ""
        summary = _strip_html(isi_raw)[:500]

        if not title:
            continue

        items.append({
            "title":     title,
            "url":       url,
            "source":    "Pemkab Banyumas",
            "summary":   summary,
            "published": rec.get("created_at") or now_wib,
        })

    return items


def fetch_rss_feeds(feed_list: list[tuple[str, str]], max_per_feed: int = 25) -> list[dict]:
    """Fetch RSS feeds, return list of {title, url, source, summary, published}."""
    items = []
    for source_name, url in feed_list:
        try:
            d = feedparser.parse(url)
        except Exception as e:
            log.warning("RSS fetch failed %s: %s", source_name, e)
            continue
        for entry in d.entries[:max_per_feed]:
            items.append({
                "title":     (entry.get("title") or "").strip(),
                "url":       (entry.get("link") or "").strip(),
                "source":    source_name,
                "summary":   (entry.get("summary") or entry.get("description") or "").strip()[:500],
                "published": _parse_date(entry),
            })
    return items


def fetch_gn_queries(queries: list[tuple[str, str]], max_per_query: int = 25) -> list[dict]:
    """Fetch Google News for multiple queries."""
    items = []
    for label, query in queries:
        results = fetch_gn(query, max_results=max_per_query)
        for r in results:
            r["source"] = r.get("source") or label
        items.extend(results)
    return items


def fetch_lapak_aduan(url: str = LAPAK_ADUAN_URL) -> list[dict]:
    """
    Fetch aduan warga dari Lapak Aduan Banyumas (halaman 1 & 2).
    GET https://lapakaduan.banyumaskab.go.id/sites/tes
    POST https://lapakaduan.banyumaskab.go.id/sites/tes2 (hal: 2)
    Returns list of {title, url, source, summary, published}.
    """
    items = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://lapakaduan.banyumaskab.go.id/sites/tes",
    }
    
    html = ""
    # Halaman 1 (dengan retry jika timeout)
    for attempt in range(2):
        try:
            r1 = requests.get(url, headers=headers, timeout=20, verify=False)
            if r1.ok and len(r1.text) > 1000:
                html += r1.text
                break
        except Exception as e:
            log.warning("fetch_lapak_aduan page 1 (attempt %d) failed: %s", attempt + 1, e)
            time.sleep(1)

    # Halaman 2 untuk kandidat tambahan
    try:
        r2 = requests.post(
            "https://lapakaduan.banyumaskab.go.id/sites/tes2",
            data={"hal": 2},
            headers=headers,
            timeout=15,
            verify=False,
        )
        if r2.ok:
            html += r2.text
    except Exception as e:
        log.warning("fetch_lapak_aduan page 2 failed: %s", e)

    if not html:
        return []

    posts = re.findall(
        r'<div class="post clearfix">(.*?)<button type="submit"[^>]*onclick="generatepagedopt\(\'([^\']+)\'\)"',
        html,
        re.S,
    )
    log.info("fetch_lapak_aduan: matched %d posts across pages", len(posts))

    MONTHS_ID = {
        'januari': 1, 'februari': 2, 'maret': 3, 'april': 4,
        'mei': 5, 'juni': 6, 'juli': 7, 'agustus': 8,
        'september': 9, 'oktober': 10, 'november': 11, 'desember': 12
    }

    now_wib = datetime.now(WIB).isoformat()
    for post_html, detail_uri in posts:
        # Title
        title_m = re.search(r'<span class="username">\s*<a[^>]*>(.*?)</a>', post_html, re.S)
        title = re.sub(r'<[^>]+>', '', title_m.group(1)).strip() if title_m else "Aduan Warga"
        title = " ".join(title.split())

        # Tiket
        tiket_m = re.search(r'#([A-Z0-9]+)', post_html)
        tiket = f"#{tiket_m.group(1)}" if tiket_m else ""

        # Status
        status_m = re.search(r'glyphicon-time"></i>\s*([^<]+)', post_html)
        status = status_m.group(1).strip() if status_m else "Proses"

        # Channel & Date from description
        desc_m = re.search(r'<span class="description"[^>]*>(.*?)</span>', post_html, re.S)
        desc = re.sub(r'<[^>]+>', '', desc_m.group(1)).strip() if desc_m else ""
        
        # Parse channel (tiktok, whatsapp, lapak_aduan, etc)
        channel_m = re.search(r'via\s+([A-Za-z0-9_]+)', desc, re.I)
        raw_ch = channel_m.group(1).lower() if channel_m else "web"
        if raw_ch == "tiktok":
            channel = "TikTok"
        elif raw_ch == "whatsapp":
            channel = "WhatsApp"
        elif "lapak" in raw_ch:
            channel = "Lapak Aduan"
        else:
            channel = raw_ch.capitalize()

        # Parse exact date & time
        pub_date = now_wib
        date_m = re.search(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})', desc)
        if date_m:
            day, mon_str, year, hr, mi, sec = date_m.groups()
            mon = MONTHS_ID.get(mon_str.lower(), 9)
            try:
                pub_date = datetime(int(year), mon, int(day), int(hr), int(mi), int(sec), tzinfo=WIB).isoformat()
            except Exception:
                pub_date = now_wib

        # Body text
        body_m = re.search(r'<p>\s*(.*?)\s*</p>', post_html, re.S)
        body = re.sub(r'<[^>]+>', '', body_m.group(1)).strip() if body_m else ""
        body = " ".join(body.split())

        # Kategori
        kat_m = re.search(r'Kategori:\s*([^<]+)', post_html)
        kategori = kat_m.group(1).strip() if kat_m else "Umum"

        full_url = f"https://lapakaduan.banyumaskab.go.id{detail_uri}"
        clean_title = f"[{kategori}] {title}"
        summary = f"{body} [Status: {status}]" if body else f"[Status: {status}]"

        items.append({
            "title": clean_title,
            "url": full_url,
            "source": f"Dikirim via {channel}",
            "summary": summary[:500],
            "published": pub_date,
        })

    # Urutkan mutlak berdasarkan waktu terbaru ke terlama
    items.sort(key=lambda x: x.get("published", ""), reverse=True)
    return items


def fetch_sources_for_grid(grid: str) -> list[dict]:
    """Fetch raw items for a specific grid."""
    if grid == GRID_RADAR:
        return fetch_pemkab_berita()
    elif grid == GRID_SIGNAL:
        items = fetch_rss_feeds(SIGNAL_FEEDS)
        items.extend(fetch_gn_queries(SIGNAL_QUERIES))
        return items
    elif grid == GRID_TRACKER:
        return fetch_gn_queries(TRACKER_QUERIES)
    elif grid == GRID_PULSE:
        return fetch_lapak_aduan()
    return []


def _parse_date(entry) -> str:
    for key in ("published_parsed", "updated_parsed"):
        v = entry.get(key)
        if v:
            try:
                return datetime(*v[:6], tzinfo=timezone.utc).astimezone(WIB).isoformat()
            except Exception:
                continue
    return datetime.now(WIB).isoformat()


def curate_grid(client: GMIClient, grid: str, items: list[dict]) -> list[dict]:
    """Ask M3 to pick the GRID_ITEMS_COUNT best items for one grid."""
    if not items:
        return []

    # limit prompt size
    items = sorted(items, key=lambda x: x.get("published", ""), reverse=True)[:60]
    items_text = "\n".join(
        f"{i+1}. [{it['source']}] {it['title']}\n   url: {it['url']}\n   summary: {it['summary'][:200]}"
        for i, it in enumerate(items)
    )

    system = (
        "Kamu adalah bAIwor, kurator untuk portal informasi Purwokerto. "
        f"Tugas: pilih {GRID_ITEMS_COUNT} item paling relevan untuk satu grid. "
        "PENTING: hanya pilih dari daftar. Jangan mengarang judul/URL. "
        f"Output WAJIB JSON object dengan key 'picks' (array of {GRID_ITEMS_COUNT} items). "
        "Tiap pick WAJIB punya: idx (nomor dari daftar), confidence (0..1), "
        "reason (1 kalimat kenapa dipilih), blurb (1 kalimat ringkasan untuk user)."
    )
    user = (
        f"Grid: {grid}\n"
        f"{GRID_PROMPTS[grid]}\n\n"
        f"Daftar kandidat ({len(items)} item, urut terbaru → terlama):\n{items_text}\n\n"
        f"Output JSON dengan key 'picks' berisi persis {GRID_ITEMS_COUNT} item (atau kurang jika kandidat < {GRID_ITEMS_COUNT})."
    )

    messages = [
        ChatMessage("system", system),
        ChatMessage("user", user),
    ]

    try:
        data = client.chat_json(messages, max_tokens=3500, temperature=0.3)
    except GMIError as e:
        log.error("curate %s failed: %s", grid, e)
        return []

    picks = data.get("picks", [])
    if not isinstance(picks, list):
        log.error("curate %s: picks not a list", grid)
        return []

    out = []
    for p in picks[:GRID_ITEMS_COUNT]:
        try:
            idx = int(p["idx"]) - 1
        except (KeyError, ValueError, TypeError):
            continue
        if 0 <= idx < len(items):
            base = items[idx]
            provider = detect_provider(base["title"], base.get("summary", ""))
            out.append({
                "title": base["title"],
                "url": base["url"],
                "source": base["source"],
                "summary": base["summary"],
                "published": base["published"],
                "confidence": float(p.get("confidence", 0.5)),
                "reason": p.get("reason", "").strip(),
                "blurb": p.get("blurb", base["summary"][:140]).strip(),
                "provider": provider,
            })
    # Pastikan urutan selalu dari yang terbaru (jam dan tanggal terdepan)
    out.sort(key=lambda x: x.get("published", ""), reverse=True)
    log.info("curate %s: picked %d items", grid, len(out))
    return out


def write_cache(payload: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    log.info("wrote cache %s (%d KB)", path, path.stat().st_size // 1024)


def read_cache(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("read_cache failed: %s", e)
        return None


def run(
    cache_path: Path,
    only_grid: str | None = None,
    dry_run: bool = False,
) -> int:
    grids_to_run = [only_grid] if only_grid else GRIDS

    # fetch sources per grid
    grid_items: dict[str, list[dict]] = {}
    for grid in grids_to_run:
        items = fetch_sources_for_grid(grid)
        # de-dup
        seen = set()
        deduped = []
        for it in items:
            if it["url"] and it["url"] not in seen:
                seen.add(it["url"])
                deduped.append(it)
        grid_items[grid] = deduped
        log.info("%s: %d items after de-dup", grid, len(deduped))

    if dry_run:
        for grid, items in grid_items.items():
            log.info("dry-run %s: %d items", grid, len(items))
        return 0

    client = GMIClient()
    prev = read_cache(cache_path) or {"grids": {}, "generated_at": ""}
    new_payload = {
        "generated_at": datetime.now(WIB).isoformat(),
        "ttl_hours": 24,
        "source_count": sum(len(v) for v in grid_items.values()),
        "item_count": sum(len(v) for v in grid_items.values()),
        "grids": dict(prev.get("grids", {})),
        "stale_grids": dict(prev.get("stale_grids", {})),
    }

    for grid in grids_to_run:
        items = grid_items[grid]
        picks = curate_grid(client, grid, items)
        if picks:
            new_payload["grids"][grid] = picks
        elif grid in prev.get("grids", {}):
            log.warning("curate %s returned empty, keeping previous", grid)
            new_payload["grids"][grid] = prev["grids"][grid]
            prev_stale = (prev.get("stale_grids") or {}).get(grid)
            new_payload["stale_grids"][grid] = prev_stale or prev.get("generated_at", "")

    write_cache(new_payload, cache_path)
    stale = list(new_payload["stale_grids"])
    if stale:
        log.warning("done — wrote %d grids (stale: %s)", len(new_payload["grids"]), ", ".join(stale))
    else:
        log.info("done — wrote %d grids", len(new_payload["grids"]))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path(__file__).parent.parent / "api" / "cache_feed.json")
    ap.add_argument("--grid", choices=GRIDS, help="only run one grid")
    ap.add_argument("--dry-run", action="store_true", help="fetch sources, skip M3")
    args = ap.parse_args()
    return run(args.cache, args.grid, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
