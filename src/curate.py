"""
curate.py — purAIkerto curation engine (v2)

Architecture:
- Each grid has its own sources (RSS or Google News)
- RADAR: global RSS feeds (8)
- SIGNAL: national Google News queries (3)
- TRACKER: local Google News queries per institution (9)
- PULSE: Radar Banyumas RSS (1) — no AI filter, general news

Flow:
1. Fetch sources per grid
2. For RADAR/SIGNAL/TRACKER: filter AI-related items
3. Ask M3 to pick 9 items per grid
4. Detect provider mentions for badges
5. Write to api/cache_feed.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import feedparser

from gmi_client import GMIClient, ChatMessage, GMIError
from sources import (
    RSS_FEEDS,
    NATIONAL_QUERIES,
    LOCAL_QUERIES,
    PULSE_FEEDS,
    PROVIDERS,
    GRID_RADAR,
    GRID_SIGNAL,
    GRID_TRACKER,
    GRID_PULSE,
    GRIDS,
    is_ai_related,
    detect_provider,
)
from google_news import fetch_gn

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("puraikerto.curate")

WIB = timezone(timedelta(hours=7))

GRID_PROMPTS = {
    GRID_RADAR: (
        "Pilih 9 item PALING BARU dan PALING PENTING untuk grid RADAR. "
        "RADAR = DETECT (apa yang baru viral/penting). "
        "Fokus pada: rilis model AI, paper baru, tool baru, pengumuman besar. "
        "Hindari clickbait. Utamakan yang punya dampak luas."
    ),
    GRID_SIGNAL: (
        "Pilih 9 item PALING BERGUNA dan PALING RELEVAN untuk grid SIGNAL. "
        "SIGNAL = PRIORITIZE (apa yang worth dibaca warga Indonesia). "
        "Fokus pada: kebijakan AI di Indonesia, adopsi teknologi, edukasi, dampak ke masyarakat. "
        "Hindari yang clickbait atau hanya hype. Utamakan yang bisa ditindaklanjuti."
    ),
    GRID_TRACKER: (
        "Pilih 9 item PALING DINAMIS untuk grid TRACKER. "
        "TRACKER = FOLLOW (apa yang bergerak/berubah di daerah). "
        "Fokus pada: kegiatan kampus AI, program pemerintah daerah, inovasi lokal, pelatihan. "
        "Hindari yang statis. Utamakan yang ada aksi/kegiatan nyata."
    ),
    GRID_PULSE: (
        "Pilih 9 item PALING RELEVAN untuk grid PULSE. "
        "PULSE = berita umum terbaru yang perlu diketahui warga. "
        "Fokus pada: berita terbaru di Purwokerto/Banyumas, kegiatan masyarakat, "
        "peristiwa penting, info praktis. "
        "Hindari yang terlalu teknis. Utamakan yang mudah dipahami dan bermanfaat."
    ),
}


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
                "title": (entry.get("title") or "").strip(),
                "url": (entry.get("link") or "").strip(),
                "source": source_name,
                "summary": (entry.get("summary") or entry.get("description") or "").strip()[:500],
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


def fetch_sources_for_grid(grid: str) -> list[dict]:
    """Fetch raw items for a specific grid."""
    if grid == GRID_RADAR:
        return fetch_rss_feeds(RSS_FEEDS)
    elif grid == GRID_SIGNAL:
        return fetch_gn_queries(NATIONAL_QUERIES)
    elif grid == GRID_TRACKER:
        return fetch_gn_queries(LOCAL_QUERIES)
    elif grid == GRID_PULSE:
        return fetch_rss_feeds(PULSE_FEEDS)
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
    """Ask M3 to pick the 9 best items for one grid."""
    if not items:
        return []

    # limit prompt size
    items = sorted(items, key=lambda x: x.get("published", ""), reverse=True)[:60]
    items_text = "\n".join(
        f"{i+1}. [{it['source']}] {it['title']}\n   url: {it['url']}\n   summary: {it['summary'][:200]}"
        for i, it in enumerate(items)
    )

    system = (
        "Kamu adalah bAIwor, kurator untuk purAIkerto.my.id — portal intel AI harian. "
        "Tugas: pilih 9 item paling relevan untuk satu grid. "
        "PENTING: hanya pilih dari daftar. Jangan mengarang judul/URL. "
        "Output WAJIB JSON object dengan key 'picks' (array of 9 items). "
        "Tiap pick WAJIB punya: idx (nomor dari daftar), confidence (0..1), "
        "reason (1 kalimat kenapa dipilih), blurb (1 kalimat ringkasan untuk user)."
    )
    user = (
        f"Grid: {grid}\n"
        f"{GRID_PROMPTS[grid]}\n\n"
        f"Daftar kandidat ({len(items)} item, urut terbaru → terlama):\n{items_text}\n\n"
        f"Output JSON dengan key 'picks' berisi persis 9 item (atau kurang jika kandidat < 9)."
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
    for p in picks[:9]:
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
        # filter AI for all grids except PULSE
        if grid != GRID_PULSE:
            items = [it for it in items if is_ai_related(it["title"], it.get("summary", ""))]
        # de-dup
        seen = set()
        deduped = []
        for it in items:
            if it["url"] and it["url"] not in seen:
                seen.add(it["url"])
                deduped.append(it)
        grid_items[grid] = deduped
        log.info("%s: %d items after filter", grid, len(deduped))

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
        "grids": {},
        "stale_grids": {},
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
