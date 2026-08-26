"""
google_news.py — fetch articles from Google News via RSS

Google News doesn't have an official API, but its RSS endpoint works:
  https://news.google.com/rss/search?q=QUERY&hl=id&gl=ID&ceid=ID:id

We use this for national and local grids.
"""

import logging
import urllib.parse
import urllib.request
from typing import Optional

import feedparser

UA = "Mozilla/5.0 (compatible; purAIkerto/1.0; +https://puraikerto.my.id)"
log = logging.getLogger("puraikerto.google_news")


def build_gn_url(query: str, hl: str = "id", gl: str = "ID") -> str:
    """Build a Google News RSS URL from a query string."""
    ceid = f"{gl}:{hl}"
    q = urllib.parse.quote(query)
    return f"https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}"


def fetch_gn(query: str, max_results: int = 25, timeout: int = 20) -> list[dict]:
    """Fetch articles from Google News for a given query.

    Returns list of dicts with keys: title, url, source, summary, published.
    """
    url = build_gn_url(query)
    log.info("GN fetch: %s", query[:60])

    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except Exception as e:
        log.warning("GN fetch failed for '%s': %s", query[:40], e)
        return []

    d = feedparser.parse(raw)
    entries = getattr(d, "entries", []) or []

    items = []
    for entry in entries[:max_results]:
        title = entry.get("title", "").strip()
        if not title:
            continue

        # Google News titles often have " - SourceName" suffix
        source = ""
        if " - " in title:
            parts = title.rsplit(" - ", 1)
            title = parts[0].strip()
            source = parts[1].strip()

        link = entry.get("link", "")
        # Google News links are redirect URLs; extract real URL if possible
        if "news.google.com/rss/articles/" in link:
            # Try to get the real URL from the source_titles or just use as-is
            pass

        items.append({
            "title": title,
            "url": link,
            "source": source,
            "summary": entry.get("summary", ""),
            "published": entry.get("published", ""),
        })

    log.info("GN got %d items for '%s'", len(items), query[:40])
    return items
