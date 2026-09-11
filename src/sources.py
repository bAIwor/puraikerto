"""
sources.py — Purwokerto source configuration

Each grid has its own set of sources:
- RADAR: Berita Utama Pemkab Banyumas (banyumaskab.go.id API)
- SIGNAL: national Google News queries (3)
- TRACKER: local Google News queries per institution (9)
- PULSE: Radar Banyumas RSS (1)

Provider monitoring: 9 providers, items mentioning them get a badge.
"""

from dataclasses import dataclass, field

# ── Providers (empty, badge disabled) ──────────────────────────────────
PROVIDERS = []

# ── Grid definitions ───────────────────────────────────────────────────
GRID_RADAR   = "RADAR"
GRID_SIGNAL  = "SIGNAL"
GRID_TRACKER = "TRACKER"
GRID_PULSE   = "PULSE"

GRIDS = [GRID_RADAR, GRID_SIGNAL, GRID_TRACKER, GRID_PULSE]

# ── RADAR: Pemkab Banyumas API ────────────────────────────────────────
# POST https://banyumaskab.go.id/berita/get_data_berita
PEMKAB_API_URL      = "https://banyumaskab.go.id/berita/get_data_berita"
PEMKAB_KATEGORI     = "utama"   # hanya Berita Utama
PEMKAB_MAX_ITEMS    = 30

# ── SIGNAL: Media Berita Lokal & Peristiwa Banyumas ───────────────────
SIGNAL_FEEDS = [
    ("Radar Banyumas", "https://radarbanyumas.disway.id/rss/purwokerto"),
]

SIGNAL_QUERIES = [
    ("Kabar Banyumas", "Banyumas OR Purwokerto"),
    ("Suara Merdeka",  "(Banyumas OR Purwokerto) site:suaramerdeka.com"),
    ("Tribun Jateng",  "(Banyumas OR Purwokerto) site:tribunnews.com"),
]

# ── TRACKER: Kampus & Pendidikan Purwokerto ───────────────────────────
TRACKER_QUERIES = [
    ("Unsoed",            "(Unsoed OR \"Universitas Jenderal Soedirman\") Purwokerto"),
    ("UMP Purwokerto",    "(UMP OR \"Universitas Muhammadiyah Purwokerto\")"),
    ("Amikom Purwokerto", "(Amikom) Purwokerto"),
    ("Telkom Purwokerto", "(\"Telkom University\" OR \"SMK Telkom\") Purwokerto"),
    ("UIN Saizu",         "(UIN Saizu OR \"UIN Saifuddin Zuhri\") Purwokerto"),
    ("UBSI Purwokerto",   "(UBSI) Purwokerto"),
]

# ── PULSE: Lapak Aduan Banyumas ───────────────────────────────────────
LAPAK_ADUAN_URL = "https://lapakaduan.banyumaskab.go.id/sites/tes"

# ── AI keywords for filtering ──────────────────────────────────────────
AI_KEYWORDS = [
    "ai", "a.i.", "artificial intelligence", "kecerdasan buatan",
    "kecerdasan artifisial", "machine learning", "pembelajaran mesin",
    "deep learning", "llm", "gpt", "chatgpt", "gemini", "claude",
    "openai", "anthropic", "deepmind", "copilot", "neural",
    "generative", "genai", "model bahasa", "robotik", "robotika",
]


def is_ai_related(title: str, summary: str = "") -> bool:
    """Check if an item is AI-related (for SIGNAL/TRACKER grids)."""
    text = f"{title} {summary}".lower()
    return any(kw in text for kw in AI_KEYWORDS)


def detect_provider(title: str, summary: str = "") -> str | None:
    """Detect if item mentions a monitored provider. Returns provider name or None."""
    text = f"{title} {summary}"
    for provider in PROVIDERS:
        if provider.lower() in text.lower():
            return provider
    return None
