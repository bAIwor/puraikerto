# purAIkerto

> **"What you need to know about AI today"** — curated by bAIwor, transparent because the reasoning trace is open.

[![Track](https://img.shields.io/badge/MiniMaxathon-Track_1_Reasoning-blueviolet)](https://www.gmicloud.ai/minimax-week)
[![Model](https://img.shields.io/badge/MiniMax-M3-ff6b6b)](https://www.gmicloud.ai)
[![Provider](https://img.shields.io/badge/GMI_Cloud-OpenAI_Compatible-4ecdc4)](https://api.gmi-serving.com)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

---

## What this is

**purAIkerto** is a daily intel aggregator for AI news — built for the Purwokerto community (Indonesia) and anyone curious about AI who doesn't want to be overwhelmed by hundreds of random posts per day.

What sets it apart from other AI news portals: **bAIwor (powered by MiniMax M3) doesn't just pick and display news. It thinks — and you can watch the thinking.**

Four live grids (RADAR / SIGNAL / TRACKER / PULSE) refresh on a 24-hour window, curated automatically from multiple sources. Click any item → a **"bAIwor explains this"** panel opens, showing a **reasoning trace** step by step: plan → check source A → check source B → cross-check → conclusion + confidence level.

---

## Track 1: Reasoning — how this project meets the criteria

| Promise | Implementation |
|---|---|
| **Holds a plan** | Reasoning trace in an interactive panel — M3's step-by-step plan is visible (not a black box). |
| **Coding tools that finish the job** | M3 doesn't just think — it *executes*: scrape, store in 24h cache, format grid, generate articles. The backend running on the VPS is proof the job got finished, not just answered. |
| **Fact check themselves** | Every item has at least 2 sources compared. Output includes a **confidence level** with justification. Users can click any source to verify themselves. |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  FRONTEND (puraikerto.my.id)            │
│  - index.html (4 grids + articles)      │
│  - panel-reasoning.js (expandable trace)│
│  - assets/ (logo, animations, branding) │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  BACKEND (VPS)                          │
│  - api/feed.php (grid content)          │
│  - api/reason.php (M3 reasoning trace)  │
│  - api/article.php (longer-form)        │
│  - api/cache_feed.json (24h rolling)    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  AGENT (MiniMax M3 via GMI Cloud)       │
│  - curate.py: pick 9 items/grid/24h     │
│  - reason.py: plan + cross-check        │
│  - article.py: longer-form (on demand)  │
│  - cron hourly: rolling update          │
└─────────────────────────────────────────┘
```

**Why M3 via GMI Cloud?**
- Free for 14 days during the MiniMaxathon campaign
- OpenAI-compatible API (easy to integrate)
- Prompt caching enabled → efficient for repeated reasoning

---

## Persona: bAIwor

bAIwor = a transformation of **Bawor/Bagong** (Punakawan, the official mascot of Banyumas Regency, Indonesia) into an AI agent. Speaks Bahasa Indonesia with Banyumasan flavor when context fits. Personality: honest, straightforward, warm, **transparent** (shows the reasoning instead of giving black-box answers).

Full identity in [`docs/SOUL-bAIwor.md`](docs/SOUL-bAIwor.md).

---

## Data sources

- **M3 web search** (via GMI Cloud) — initial discovery, fact lookups
- **Public RSS feeds** (AI-focused): Hacker News (front page + AI tag), MIT Tech Review AI, OpenAI blog, Anthropic news, DeepMind blog, arXiv cs.AI
- 24-hour cache in `api/cache_feed.json`. Items drop off the grid after 24h (unless promoted to articles).

---

## Quick start (development)

### Prerequisites
- Linux VPS with PHP 8.x + Python 3.11+
- GMI Cloud API key (free during campaign)
- Domain pointed to the VPS (default: `puraikerto.my.id`)

### Setup

```bash
# 1. clone
git clone https://github.com/bAIwor/puraikerto.git
cd puraikerto

# 2. env
cp .env.example .env
# edit .env, fill in GMI_API_KEY

# 3. python deps
cd src
pip install -r requirements.txt
cd ..

# 4. cron curate
crontab -e
# add:
# 0 * * * * cd /home/wijang/www/puraikerto/src && python3 curate.py >> /home/wijang/logs/puraikerto-curate.log 2>&1

# 5. nginx (already configured on the VPS, see docs/nginx.conf)
```

See [`docs/SETUP.md`](docs/SETUP.md) for full details.

---

## Repo layout

```
puraikerto/
├── README.md                   ← you are here
├── LICENSE
├── .env.example                ← env template (no secrets)
├── .gitignore
├── src/                        ← Python agent
│   ├── curate.py               ← M3 curation engine
│   ├── reason.py               ← M3 reasoning trace generator
│   ├── article.py              ← longer-form generator
│   ├── gmi_client.py           ← GMI Cloud API wrapper
│   ├── prompts/                ← prompt templates
│   └── requirements.txt
├── api/                        ← PHP backend
│   ├── feed.php                ← grid content endpoint
│   ├── reason.php              ← reasoning trace endpoint
│   ├── article.php             ← articles endpoint
│   └── cache_feed.json         ← 24h rolling cache
├── assets/                     ← branding & UI
│   ├── logo.svg
│   ├── style.css               ← neo-brutalist base
│   ├── panel-reasoning.js      ← interactive trace
│   └── animations.css
├── docs/                       ← documentation
│   ├── SETUP.md
│   ├── SOUL-bAIwor.md
│   ├── ARCHITECTURE.md
│   └── CONCEPT.md
├── scripts/                    ← utility scripts
│   ├── deploy.sh               ← git pull + restart
│   └── test-m3.sh              ← test M3 connectivity
└── .github/
    └── workflows/              ← CI/CD (optional)
```

---

## Track 1 Reasoning — example reasoning trace

Example for the item "GPT-5 rumored release date":

```json
{
  "title": "GPT-5 rumored to launch Q4 2026",
  "trace": [
    {"step": 1, "action": "Identify claim", "result": "The claim is a release date of Q4 2026 from source X"},
    {"step": 2, "action": "Check source A (OpenAI blog)", "result": "No official announcement. CEO statement only said 'in development'"},
    {"step": 3, "action": "Check source B (Reuters tech)", "result": "Internal report says 'Q1 2026 very unlikely, source uncertain'"},
    {"step": 4, "action": "Check source C (HN discussion)", "result": "Speculation based on prior model release pattern, not fact"},
    {"step": 5, "action": "Cross-check", "result": "3/3 sources do not confirm Q4 2026"},
    {"step": 6, "action": "Conclusion", "result": "Claim is speculative. Displayed with confidence LOW (35%)"}
  ],
  "confidence": 0.35,
  "sources": ["openai.com/blog", "reuters.com/tech", "news.ycombinator.com"]
}
```

Users can click any step to see the detail. **The reasoning trace is an audit trail, not magic.**

---

## Contributing & license

This project was made for MiniMaxathon (Track 1 — Reasoning). After the contest, the license is MIT — free to use, modify, and distribute.

See [`LICENSE`](LICENSE) for full terms.

---

## Links

- 🌐 Live: https://puraikerto.my.id
- 📰 MiniMaxathon: https://www.gmicloud.ai/minimax-week
- 🤖 MiniMax M3: https://www.gmicloud.ai
- 🏛️ bAIwor identity: [`docs/SOUL-bAIwor.md`](docs/SOUL-bAIwor.md)

---

*Built with 🎭 by **wijang** + 🤖 by **bAIwor (MiniMax M3 via GMI Cloud)***
