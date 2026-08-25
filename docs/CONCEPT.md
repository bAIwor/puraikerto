# Concept — purAIkerto for MiniMaxathon

> Concept & positioning of purAIkerto as a submission for MiniMaxathon (Track 1 — Reasoning). Mirrored from the Obsidian note `puraikerto/KONSEP-KONTES.md`.

---

## Positioning (one sentence)

> **purAIkerto = "What you need to know about AI today" — curated by bAIwor, refreshed every 24 hours, with a transparent reasoning trace.**

**Audience**: the Purwokerto community (Indonesia) and anyone curious about AI who doesn't want to be overwhelmed by hundreds of random posts per day.

---

## Three promises fulfilled (Track 1 judging criteria)

| Promise | Implementation |
|---|---|
| **Holds a plan** | Click an item → the "bAIwor explains this" panel opens. The reasoning trace shows a 3–5 step plan, the execution of each step, and an honest outcome (including "not sure" / "source didn't confirm" / "only 1 source, weak"). |
| **Coding tools that finish the job** | M3 (via GMI Cloud) actually *executes*: scrape RSS feeds, call the M3 API, parse JSON, write the cache. The backend running on the VPS is proof the job got finished, not just answered. |
| **Fact check themselves** | Every item compares at least 2 sources (primary + secondary RSS feed). The output includes an explicit **confidence level** with justification. Users can click any source to verify themselves. |

---

## Four-grid structure (kept from the previous version)

| Grid | Action | Subtitle | Content |
|---|---|---|---|
| 📡 **RADAR** | DETECT | What's new | AI news from the last 24h — model releases, viral papers, new tools |
| ⚡ **SIGNAL** | PRIORITIZE | What matters | The positive / useful — tutorials, good policy, educational |
| 🛰️ **TRACKER** | FOLLOW | What's moving | Trends & moving numbers — funding, stats, prices |
| 💓 **PULSE** | UNDERSTAND NOW | What's happening | Public discussion — ethics, community reaction, opinion |

**Dynamic**: each grid's composition changes every hour based on what's important (rolling 24h window).

---

## Persona: bAIwor

Still the soul of purAIkerto. Punakawan from Banyumas (Bawor/Bagong), speaks Bahasa Indonesia with Banyumasan flavor when context fits, transparent & honest. Full identity: [`docs/SOUL-bAIwor.md`](SOUL-bAIwor.md).

**What's new**: bAIwor no longer just "displays" — it **asks, thinks, and explains why it thinks that way**. The reasoning trace is the "internal dialog" opened up to the user.

---

## Data sources

- **M3 web search** via GMI Cloud (free for 14 days during the campaign)
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

## Timeline (14-day sprint)

| Day | Target |
|---|---|
| 1–2 | Repo, structure, README, M3 integration test, basic branding |
| 3–7 | Core engine: curation + reasoning trace generator |
| 8–10 | Frontend: 4 grids + interactive reasoning panel + animations |
| 11–12 | Articles/blog section + UI polish |
| 13–14 | Testing, bug fixes, demo video, submission form |

Principle: "ship first, perfect later". 14 days is the max — finishing earlier is fine.

---

## Out of scope (not done)

- Switching domain/subdomain
- Adding new WhatsApp/Telegram bots
- Paid X/Reddit/IG APIs
- Rebuilding bAIwor from scratch (only extending)
- Adding user/login (not needed, public site)
