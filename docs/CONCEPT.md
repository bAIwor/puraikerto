# Concept — purAIkerto untuk MiniMaxathon

> Konsep & positioning purAIkerto sebagai submission untuk MiniMaxathon (Track 1 — Reasoning). Mirror dari Obsidian `puraikerto/KONSEP-KONTES.md`.

---

## Positioning (1 kalimat)

> **purAIkerto = "Apa yang perlu kamu tahu tentang AI hari ini" — dikurasi bAIwor, berubah tiap 24 jam, dengan reasoning trace yang transparan.**

**Audience**: masyarakat Purwokerto & nasional yang penasaran dunia AI tapi ga mau overwhelmed.

---

## Tiga janji yang dipenuhi (kriteria hakim Track 1)

| Janji | Implementasi |
|---|---|
| **Holds a plan** | Klik item → panel "bAIwor explains this" muncul. Reasoning trace step-by-step kelihatan: plan 3-5 langkah → eksekusi tiap step → outcome jujur (termasuk "tidak yakin"). |
| **Coding tools that finish the job** | M3 (via GMI Cloud) benar-benar *execute*: scrape RSS, panggil M3 API, parse JSON, tulis cache. Backend di VPS = bukti "the job got finished", bukan hanya dijawab. |
| **Fact check themselves** | Setiap item minimal 2 sumber dibanding (RSS feed primer + sekunder). Output menyertakan **confidence level** + justifikasi. User bisa klik sumber untuk verifikasi sendiri. |

---

## Struktur 4-grid (dipertahankan dari versi lama)

| Grid | Action | Subtitle | Isi |
|---|---|---|---|
| 📡 **RADAR** | DETECT | What's new | AI news 24 jam — rilis model, paper viral, tool baru |
| ⚡ **SIGNAL** | PRIORITIZE | What matters | Yang positif/berguna — tutorial, kebijakan baik, edukatif |
| 🛰️ **TRACKER** | FOLLOW | What's moving | Tren & angka dinamis — funding, statistik, harga |
| 💓 **PULSE** | UNDERSTAND NOW | What's happening | Diskusi publik — etika, reaksi komunitas, opini |

**Dinamis**: komposisi tiap grid **berubah tiap 1 jam** sesuai apa yang lagi penting (rolling 24h window).

---

## Persona: bAIwor

Tetap jadi jiwa purAIkerto. Punakawan Banyumas (Bawor/Bagong), bahasa Indonesia + Banyumasan saat konteks, transparan & jujur. Identitas lengkap: [`docs/SOUL-bAIwor.md`](SOUL-bAIwor.md).

**Yang baru**: bAIwor sekarang bukan hanya "tampil" — dia **bertanya, mikir, dan jelasin kenapa dia mikir begitu**. Reasoning trace adalah "dialog internal" yang dibuka ke user.

---

## Sumber data

- **M3 web search** via GMI Cloud (free 14 hari masa kampanye)
- **RSS publik** AI-relevant: Hacker News, MIT Tech Review, OpenAI blog, Anthropic news, DeepMind, arXiv cs.AI
- Cache 24 jam di `api/cache_feed.json`. Item turun dari grid setelah 24 jam (kecuali masuk artikel/blog).

---

## Arsitektur

```
FRONTEND (puraikerto.my.id)
   index.html (4 grid + artikel)
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
   src/curate.py      ← pilih 9 item/grid (cron tiap 1 jam)
   src/reason.py      ← generate trace (cron tiap 6 jam + on-demand)
```

---

## Timeline (sprint 14 hari)

| Hari | Target |
|---|---|
| 1-2 | Repo, struktur, README, M3 integration test, branding dasar |
| 3-7 | Core engine: curation + reasoning trace generator |
| 8-10 | Frontend: 4-grid + panel reasoning interaktif + animasi |
| 11-12 | Artikel/blog section + polish UI |
| 13-14 | Testing, fix bug, demo video, submit form |

Prinsip: "selesai dulu, sempurna kemudian". 14 hari max, kelar lebih cepat ya.

---

## Yang TIDAK dilakukan (di luar scope)

- Ganti domain/subdomain
- Tambah WhatsApp/Telegram baru
- Tambah API X/Reddit/IG berbayar
- Bangun ulang bAIwor dari nol (cuma extend)
- Tambah user/login (ga perlu, public)
