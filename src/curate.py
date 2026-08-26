"""
curate.py — purAIkerto curation engine

What this does:
- Pulls raw items from RSS feeds (Hacker News, MIT Tech Review, OpenAI, etc.)
- Asks M3 (via GMI Cloud) to pick the 9 most "important" items per grid
  (RADAR/SIGNAL/TRACKER/PULSE) for the next 24h window
- Writes the curated feed to api/cache_feed.json (consumed by feed.php)

Design choices:
- 4 grids, each 9 items max (keeps the visual identity from the old puraikerto)
- All output is structured JSON; the prompt asks M3 to give confidence + reasoning
  per item so the frontend can show "why this was picked" later
- Idempotent: running twice in a row produces the same output if input unchanged
- Fail-safe: if M3 is down, the previous cache is preserved (no broken page)

Usage:
    python curate.py                  # full run
    python curate.py --dry-run        # fetch sources but don't call M3
    python curate.py --grid RADAR     # only one grid
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

# Allow running this file directly (python curate.py) from src/
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("puraikerto.curate")

WIB = timezone(timedelta(hours=7))

GRIDS = ("RADAR", "SIGNAL", "TRACKER", "PULSE")

# default sources per grid — kept simple so the M3 prompt stays focused
DEFAULT_FEEDS = [
    "https://hnrss.org/frontpage",                       # Hacker News front
    "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT",       # HN AI tag
    "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    "https://openai.com/blog/rss.xml",
    "https://www.anthropic.com/news/rss.xml",
    "https://export.arxiv.org/rss/cs.AI",                # arXiv AI papers
]

GRID_PROMPTS = {
    "RADAR": (
        "Pilih 9 item PALING BARU dan PALING PENTING untuk grid RADAR. "
        "RADAR = DETECT (apa yang baru viral/penting). "
        "Fokus pada: rilis model AI, paper baru, tool baru, pengumuman besar. "
        "Hindari clickbait. Utamakan yang punya dampak luas."
    ),
    "SIGNAL": (
        "Pilih 9 item PALING BERGUNA dan PALING POSITIF untuk grid SIGNAL. "
        "SIGNAL = PRIORITIZE (apa yang worth dibaca warga biasa). "
        "Fokus pada: tutorial, panduan praktis, kebijakan baik, inisiatif edukatif. "
        "Hindari yang clickbait atau hanya hype. Utamakan yang bisa ditindaklanjuti."
    ),
    "TRACKER": (
        "Pilih 9 item PALING DINAMIS untuk grid TRACKER. "
        "TRACKER = FOLLOW (apa yang bergerak/berubah). "
        "Fokus pada: tren angka, funding AI, perubahan harga, statistik penggunaan, "
        "data yang bergerak. Hindari yang statis. Utamakan yang ada angka/perubahan jelas."
    ),
    "PULSE": (
        "Pilih 9 item PALING RELEVAN dengan SUASANA/KONVERSASI untuk grid PULSE. "
        "PULSE = UNDERSTAND NOW (apa yang sedang jadi pembicaraan). "
        "Fokus pada: diskusi etika, reaksi komunitas, debate publik, opini penting. "
        "Hindari yang hard news. Utamakan yang punya banyak sudut pandang."
    ),
}


# ---------- source fetch ----------

def fetch_sources(feed_urls: list[str], max_per_feed: int = 25) -> list[dict]:
    """Fetch all feeds, return a flat list of {title, url, source, summary, published}."""
    items: list[dict] = []
    for url in feed_urls:
        try:
            d = feedparser.parse(url)
        except Exception as e:
            log.warning("feed fetch failed %s: %s", url, e)
            continue
        source_title = (d.feed.get("title") or url) if hasattr(d, "feed") else url
        for entry in d.entries[:max_per_feed]:
            items.append(
                {
                    "title": (entry.get("title") or "").strip(),
                    "url": (entry.get("link") or "").strip(),
                    "source": source_title,
                    "summary": (entry.get("summary") or entry.get("description") or "").strip()[:500],
                    "published": _parse_date(entry),
                }
            )
    # de-dup by url
    seen = set()
    deduped = []
    for it in items:
        if it["url"] and it["url"] not in seen:
            seen.add(it["url"])
            deduped.append(it)
    log.info("fetched %d unique items from %d feeds", len(deduped), len(feed_urls))
    return deduped


def _parse_date(entry) -> str:
    for key in ("published_parsed", "updated_parsed"):
        v = entry.get(key)
        if v:
            try:
                return datetime(*v[:6], tzinfo=timezone.utc).astimezone(WIB).isoformat()
            except Exception:
                continue
    return datetime.now(WIB).isoformat()


# ---------- LLM curation ----------

def curate_grid(client: GMIClient, grid: str, items: list[dict]) -> list[dict]:
    """Ask M3 to pick the 9 best items for one grid, return with reasoning."""
    if not items:
        return []
    # limit prompt size — top 50 by recency
    items = sorted(items, key=lambda x: x.get("published", ""), reverse=True)[:50]
    items_text = "\n".join(
        f"{i+1}. [{it['source']}] {it['title']}\n   url: {it['url']}\n   summary: {it['summary'][:200]}"
        for i, it in enumerate(items)
    )
    system = (
        "Kamu adalah bAIwor, kurator untuk purAIkerto.my.id — portal intel AI harian. "
        "Tugas: pilih 9 item paling relevan untuk satu grid. "
        "PENTING: hanya pilih dari daftar. Jangan mengarang judul/URL. "
        "Output WAJIB JSON object dengan key 'picks' (array of 9 items, persis seperti input). "
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
            out.append(
                {
                    "title": base["title"],
                    "url": base["url"],
                    "source": base["source"],
                    "summary": base["summary"],
                    "published": base["published"],
                    "confidence": float(p.get("confidence", 0.5)),
                    "reason": p.get("reason", "").strip(),
                    "blurb": p.get("blurb", base["summary"][:140]).strip(),
                }
            )
    log.info("curate %s: picked %d items", grid, len(out))
    return out


# ---------- cache IO ----------

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


# ---------- main ----------

def run(
    cache_path: Path,
    feed_urls: list[str] | None = None,
    only_grid: str | None = None,
    dry_run: bool = False,
) -> int:
    feed_urls = feed_urls or DEFAULT_FEEDS
    items = fetch_sources(feed_urls)

    if dry_run:
        log.info("dry-run: %d items fetched, skipping M3", len(items))
        return 0

    client = GMIClient()

    # load previous cache to preserve untouched grids
    prev = read_cache(cache_path) or {"grids": {}, "generated_at": ""}
    new_payload = {
        "generated_at": datetime.now(WIB).isoformat(),
        "ttl_hours": 24,
        "source_count": len(feed_urls),
        "item_count": len(items),
        "grids": {},
        # grids whose curation failed this run and are showing carried-over
        # content. The frontend surfaces this so a reader is never shown stale
        # picks as if they were fresh.
        "stale_grids": {},
    }

    grids_to_run = [only_grid] if only_grid else list(GRIDS)
    for grid in grids_to_run:
        picks = curate_grid(client, grid, items)
        if picks:
            new_payload["grids"][grid] = picks
        elif grid in prev.get("grids", {}):
            log.warning("curate %s returned empty, keeping previous", grid)
            new_payload["grids"][grid] = prev["grids"][grid]
            # carry forward the original timestamp so age is honest even
            # across several consecutive failures
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
    ap.add_argument("--feeds", nargs="*", help="override RSS feed list")
    ap.add_argument("--grid", choices=GRIDS, help="only run one grid")
    ap.add_argument("--dry-run", action="store_true", help="fetch sources, skip M3")
    args = ap.parse_args()
    return run(args.cache, args.feeds, args.grid, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
