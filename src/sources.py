"""
sources.py — purAIkerto source configuration

Each grid has its own set of sources:
- RADAR: global RSS feeds (8)
- SIGNAL: national Google News queries (3)
- TRACKER: local Google News queries per institution (9)
- PULSE: Radar Banyumas RSS (1)

Provider monitoring: 9 providers, items mentioning them get a badge.
"""

from dataclasses import dataclass, field

# ── Provider monitoring (9 providers) ──────────────────────────────────
# Items mentioning these get a provider badge in the grid.
PROVIDERS = [
    "Google",
    "OpenAI",
    "Meta",
    "Anthropic",
    "xAI",
    "Xiaomi",
    "DeepSeek",
    "Qwen",
    "MiniMax",
]

# ── Grid definitions ───────────────────────────────────────────────────
GRID_RADAR = "RADAR"
GRID_SIGNAL = "SIGNAL"
GRID_TRACKER = "TRACKER"
GRID_PULSE = "PULSE"

GRIDS = [GRID_RADAR, GRID_SIGNAL, GRID_TRACKER, GRID_PULSE]

# ── RSS feeds (global) ────────────────────────────────────────────────
RSS_FEEDS = [
    ("OpenAI", "https://openai.com/blog/rss.xml"),
    ("Google DeepMind", "https://deepmind.google/blog/rss.xml"),
    ("The Verge AI", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
    ("Ars Technica AI", "https://arstechnica.com/ai/feed/"),
    ("MIT Tech Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed"),
    ("Hacker News AI", "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT"),
    ("MIT News AI", "https://news.mit.edu/rss/topic/artificial-intelligence2"),
    ("Cointelegraph AI", "https://cointelegraph.com/rss/tag/ai"),
]

# ── Google News queries (national) ─────────────────────────────────────
# Format: (label, query_without_site)
NATIONAL_QUERIES = [
    ("Tempo Digital", "site:tempo.co/digital"),
    ("Detik inet", "site:inet.detik.com"),
    ("Kompas Tekno", "site:tekno.kompas.com"),
]

# ── Google News queries (local institutions) ──────────────────────────
LOCAL_QUERIES = [
    ("UBSI Purwokerto", "(UBSI) Purwokerto"),
    ("SMK Telkom Purwokerto", "(SMK Telkom) Purwokerto"),
    ("Unsoed", "(Unsoed) Purwokerto"),
    ("UT Purwokerto", '(UT OR "Universitas Terbuka") Purwokerto'),
    ("AMIKOM Purwokerto", "(AMIKOM) Purwokerto"),
    ("Telkom University Purwokerto", "(Telkom University) Purwokerto"),
    ("UMP Purwokerto", "(UMP OR Muhammadiyah) Purwokerto"),
    ("Pemkab Banyumas", "Banyumas Purwokerto"),
    ("Pemkot Purwokerto", "Purwokerto"),
]

# ── PULSE: Radar Banyumas RSS ─────────────────────────────────────────
PULSE_FEEDS = [
    ("Radar Banyumas", "https://radarbanyumas.disway.id/rss/purwokerto"),
]

# ── AI keywords for filtering ──────────────────────────────────────────
AI_KEYWORDS = [
    "ai", "a.i.", "artificial intelligence", "kecerdasan buatan",
    "kecerdasan artifisial", "machine learning", "pembelajaran mesin",
    "deep learning", "llm", "gpt", "chatgpt", "gemini", "claude",
    "openai", "anthropic", "deepmind", "copilot", "neural",
    "generative", "genai", "model bahasa", "robotik", "robotika",
]


def is_ai_related(title: str, summary: str = "") -> bool:
    """Check if an item is AI-related (for SIGNAL/TRACKER/RADAR grids)."""
    text = f"{title} {summary}".lower()
    return any(kw in text for kw in AI_KEYWORDS)


def detect_provider(title: str, summary: str = "") -> str | None:
    """Detect if item mentions a monitored provider. Returns provider name or None."""
    text = f"{title} {summary}"
    for provider in PROVIDERS:
        if provider.lower() in text.lower():
            return provider
    return None
