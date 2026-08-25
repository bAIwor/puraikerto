# Concept — purAIkerto

> The thinking behind purAIkerto: what it is, why it works the way it does, and the principles that keep it honest.

---

## Positioning

> **purAIkerto = "What you need to know about AI today" — curated by bAIwor, refreshed every 24 hours, with a transparent reasoning trace.**

**Audience**: the Purwokerto community (Indonesia) and anyone curious about AI who doesn't want to be overwhelmed by hundreds of random posts per day.

---

## Why the reasoning trace is the core feature

Most AI products give you an answer. Good ones let you ask "why?" Some let you re-run with a different model. Almost none show you what they did to get there.

purAIkerto does. Every item on every grid has a trace attached:

1. **A plan** (3–5 steps) — what the agent intends to check
2. **The execution** — what it found at each step, including weak results and "source didn't confirm"
3. **Sources** — links to where it looked
4. **A confidence score** (0.0–1.0) — how sure it is, honestly
5. **A summary** — one or two sentences for the user

This isn't a debugging tool. It's the product. The user-facing reason it exists: when an AI says "this is important", you should be able to see why — and disagree if you want.

---

## Four-grid structure

| Grid | Action | Subtitle | Content |
|---|---|---|---|
| 📡 **RADAR** | DETECT | What's new | AI news from the last 24h — model releases, viral papers, new tools |
| ⚡ **SIGNAL** | PRIORITIZE | What matters | The positive / useful — tutorials, good policy, educational |
| 🛰️ **TRACKER** | FOLLOW | What's moving | Trends & moving numbers — funding, stats, prices |
| 💓 **PULSE** | UNDERSTAND NOW | What's happening | Public discussion — ethics, community reaction, opinion |

**Dynamic**: each grid's composition changes every hour based on what's important (rolling 24h window). Items drop off after 24h unless promoted to an article.

---

## Persona: bAIwor

Still the soul of purAIkerto. Punakawan from Banyumas (Bawor/Bagong), speaks Bahasa Indonesia with Banyumasan flavor when context fits, transparent & honest. Full identity: [`docs/SOUL-bAIwor.md`](SOUL-bAIwor.md).

**What's new in this version**: bAIwor no longer just "displays" — it **asks, thinks, and explains why it thinks that way**. The reasoning trace is the "internal dialog" opened up to the user.

---

## Data sources

- **M3 web search** via GMI Cloud
- **Public RSS feeds** (AI-focused): Hacker News, MIT Tech Review, OpenAI blog, Anthropic news, DeepMind, arXiv cs.AI
- 24-hour cache in `api/cache_feed.json`. Items drop off the grid after 24h (unless promoted to an article).

---

## Architecture

```
FRONTEND (puraikerto.my.id)
   index.html (4 grids + articles)
   assets/style.css (neo-brutalist)
   assets/panel-reasoning.js (interactive trace)
   ↓
BACKEND (VPS, nginx + PHP-FPM)
   api/feed.php      ← grid content
   api/reason.php    ← reasoning trace on demand
   api/cache_*.json  ← rolling cache
   ↓
AGENT (Python + M3 via GMI Cloud)
   src/gmi_client.py  ← API wrapper
   src/curate.py      ← pick 9 items/grid (cron hourly)
   src/reason.py      ← generate trace (cron every 6h + on demand)
```

---

## Design choices

- **9 items per grid** is the cap, not a target. If only 4 are good, show 4. Don't pad.
- **No fabrication**: if a source doesn't mention something, the trace says `unknown`. Confidence reflects what was actually found.
- **HTML-first frontend**: no framework, no build step. The page is just files. Easy to read, easy to fork.
- **PHP backend**: only because it's already running on the VPS. Could be replaced with anything that serves JSON.
- **Cron over queues**: simpler. Hourly rolling is enough for a 24h window.
- **MIT license**: do whatever you want with it.

---

## What's out of scope

- Switching domain / subdomain
- Paid social APIs (X, Reddit, IG)
- User accounts / login (public site)
- A new WhatsApp or Telegram bot
- Rebuilding bAIwor from scratch (only extending)
