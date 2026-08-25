"""
article.py — purAIkerto longer-form article generator

Generates 1 article per run for the bAIwor section. Articles are
longer-form, not bound to the 24h rolling window, and only update
on demand (not via cron).

Usage:
    python article.py                    # generate 1 article (random topic from news)
    python article.py --topic "X"        # generate on a specific topic
    python article.py --from-cache       # use items from cache_feed.json
    python article.py --list             # list existing articles
    python article.py --delete ID        # delete an article
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path

from gmi_client import GMIClient, ChatMessage, GMIError

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("puraikerto.article")

WIB = timezone(timedelta(hours=7))

ARTICLE_DIR = Path(__file__).parent.parent / "articles"
CACHE_FEED = Path(__file__).parent.parent / "api" / "cache_feed.json"


@dataclass
class Article:
    id: str
    title: str
    slug: str
    topic: str
    body: str            # markdown
    summary: str         # 1-2 sentence excerpt
    sources: list[str]   # URL list
    grid_origin: str     # which grid this was inspired by
    author: str = "bAIwor"
    model: str = ""
    confidence: float = 0.0
    created_at: str = ""
    updated_at: str = ""
    read_minutes: int = 3


def _now_iso() -> str:
    return datetime.now(WIB).isoformat()


def _slugify(s: str) -> str:
    """Convert title to URL-safe slug."""
    import re
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")[:80]


SYSTEM_PROMPT = (
    "Kamu adalah bAIwor, penulis untuk purAIkerto.my.id — portal intel AI. "
    "Tugas: tulis artikel lebih panjang (long-form) tentang 1 topik AI yang sedang penting. "
    "Audiens: masyarakat Indonesia (kelas menengah, melek teknologi, ga perlu expert). "
    "Gaya: hangat, jelas, sedikit Banyumasan jika konteks, tidak bertele-tele. "
    "Struktur: intro (1 paragraf) → context (1-2 paragraf) → kenapa ini penting (1 paragraf) → "
    "→ apa yang bisa dilakukan/dilihat pembaca (1 paragraf) → kesimpulan singkat. "
    "Pakai markdown headings (## / ###), bold untuk istilah penting, list kalau perlu. "
    "Panjang: 400-700 kata. "
    "WAJIB jujur: kalau ada ketidakpastian, tulis 'belum jelas' atau 'perlu verifikasi'. "
    "JANGAN mengarang fakta. Kalau ragu, confidence < 0.7. "
    "Output JSON object dengan key: "
    "  title (string) — judul artikel (max 80 char) "
    "  summary (string) — 1-2 kalimat excerpt "
    "  body (string) — markdown lengkap "
    "  sources (array of string) — URL atau nama sumber yang dirujuk "
    "  confidence (float 0..1) — jujur! "
    "  read_minutes (int) — estimasi waktu baca"
)


def _item_to_user(item: dict | None, topic: str | None) -> str:
    if item:
        return (
            f"Topik diambil dari grid {item.get('grid', 'unknown')}:\n"
            f"Title: {item.get('title', '')}\n"
            f"Source: {item.get('source', '')}\n"
            f"URL: {item.get('url', '')}\n"
            f"Summary: {item.get('summary', '')[:400]}\n\n"
            f"Tulis artikel long-form (400-700 kata) yang menjelaskan hal ini "
            f"ke pembaca awam. Sertakan sources yang valid."
        )
    if topic:
        return f"Topik: {topic}\n\nTulis artikel long-form (400-700 kata) tentang hal ini. "
    raise ValueError("must supply either item or topic")


def generate_article(
    client: GMIClient,
    item: dict | None = None,
    topic: str | None = None,
    grid: str = "manual",
) -> Article:
    """Generate one article via M3."""
    title_hint = item["title"] if item else (topic or "untitled")
    log.info("generating article: %s", title_hint[:60])
    try:
        resp = client.chat_json(
            [
                ChatMessage("system", SYSTEM_PROMPT),
                ChatMessage("user", _item_to_user(item, topic)),
            ],
            max_tokens=3000,
            temperature=0.5,
        )
    except GMIError as e:
        log.error("M3 call failed: %s", e)
        raise

    title = (resp.get("title") or title_hint).strip()[:120]
    article_id = uuid.uuid4().hex[:12]
    slug = _slugify(title) + "-" + article_id[:6]
    return Article(
        id=article_id,
        title=title,
        slug=slug,
        topic=item["title"] if item else (topic or ""),
        body=resp.get("body", "").strip(),
        summary=(resp.get("summary") or "").strip()[:280],
        sources=resp.get("sources", []) if isinstance(resp.get("sources"), list) else [],
        grid_origin=grid,
        model=getattr(client, "model", ""),
        confidence=float(resp.get("confidence", 0.5)),
        read_minutes=int(resp.get("read_minutes", 3)),
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )


def save_article(article: Article) -> Path:
    """Save article to articles/<id>.json. Returns the file path."""
    ARTICLE_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTICLE_DIR / f"{article.id}.json"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(asdict(article), ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    log.info("saved article: %s -> %s", article.id, path)
    return path


def list_articles() -> list[dict]:
    if not ARTICLE_DIR.exists():
        return []
    out = []
    for p in sorted(ARTICLE_DIR.glob("*.json"), reverse=True):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            d["_file"] = p.name
            out.append(d)
        except Exception as e:
            log.warning("read %s failed: %s", p, e)
    return out


def delete_article(article_id: str) -> bool:
    path = ARTICLE_DIR / f"{article_id}.json"
    if path.exists():
        path.unlink()
        log.info("deleted article: %s", article_id)
        return True
    return False


def pick_from_cache() -> dict | None:
    """Pick 1 random recent item from cache_feed.json."""
    if not CACHE_FEED.exists():
        return None
    try:
        d = json.loads(CACHE_FEED.read_text(encoding="utf-8"))
    except Exception:
        return None
    import random
    grids = d.get("grids", {})
    if not grids:
        return None
    grid_name = random.choice(list(grids.keys()))
    items = grids[grid_name]
    if not items:
        return None
    it = random.choice(items)
    return {**it, "grid": grid_name}


# ---------- main ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", help="generate article on a specific topic")
    ap.add_argument("--from-cache", action="store_true", help="pick item from cache_feed.json")
    ap.add_argument("--list", action="store_true", help="list existing articles")
    ap.add_argument("--delete", metavar="ID", help="delete article by id")
    ap.add_argument("--grid", default="manual", help="grid name (for metadata)")
    args = ap.parse_args()

    if args.list:
        articles = list_articles()
        print(json.dumps([{
            "id": a["id"],
            "title": a["title"],
            "topic": a.get("topic", "")[:60],
            "confidence": a.get("confidence", 0),
            "created_at": a.get("created_at", ""),
            "read_minutes": a.get("read_minutes", 3),
        } for a in articles], ensure_ascii=False, indent=2))
        return 0

    if args.delete:
        ok = delete_article(args.delete)
        print(f"deleted: {ok}")
        return 0 if ok else 1

    client = GMIClient()
    item = None
    if args.from_cache:
        item = pick_from_cache()
        if not item:
            log.error("no items in cache; run curate.py first")
            return 1
        log.info("picked from cache: grid=%s title=%s", item.get("grid"), item.get("title"))

    article = generate_article(client, item=item, topic=args.topic, grid=args.grid)
    path = save_article(article)

    print(json.dumps({
        "id": article.id,
        "title": article.title,
        "slug": article.slug,
        "path": str(path),
        "confidence": article.confidence,
        "read_minutes": article.read_minutes,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
