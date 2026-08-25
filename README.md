# purAIkerto

> **"Apa yang perlu kamu tahu tentang AI hari ini"** — dikurasi oleh bAIwor, transparan karena reasoning trace-nya terbuka.

[![Track](https://img.shields.io/badge/MiniMaxathon-Track_1_Reasoning-blueviolet)](https://www.gmicloud.ai/minimax-week)
[![Model](https://img.shields.io/badge/MiniMax-M3-ff6b6b)](https://www.gmicloud.ai)
[![Provider](https://img.shields.io/badge/GMI_Cloud-OpenAI_Compatible-4ecdc4)](https://api.gmi-serving.com)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

---

## 🎯 Apa ini

**purAIkerto** adalah intel aggregator harian untuk kabar AI — dirancang untuk masyarakat Purwokerto dan nasional yang penasaran dengan dunia AI tapi tidak mau overwhelmed oleh ratusan berita acak per hari.

Yang membedakannya dari portal berita AI lain: **bAIwor (powered by MiniMax M3) bukan hanya memilih dan menampilkan berita. Dia mikir, dan kamu bisa lihat proses mikirnya.**

Empat grid utama (RADAR / SIGNAL / TRACKER / PULSE) berubah setiap 24 jam, dikurasi otomatis dari multi-sumber. Klik item mana saja → panel **"bAIwor explains this"** terbuka, menampilkan **reasoning trace** step-by-step: rencana → cek sumber A → cek sumber B → cross-check → kesimpulan + confidence level.

---

## 🧠 Track 1: Reasoning — kenapa project ini menang (atau tidak)

Kriteria hakim kontes:

| Janji | Implementasi |
|---|---|
| **Holds a plan** | Reasoning trace di panel interaktif — rencana M3 langkah demi langkah kelihatan (bukan black-box). |
| **Coding tools that finish the job** | M3 bukan cuma mikir — dia *execute*: scrape, simpan ke cache 24 jam, format grid, generate artikel. Backend di VPS adalah bukti "the job got finished". |
| **Fact check themselves** | Setiap item punya minimal 2 sumber yang dibandingkan. Output menyertakan **confidence level** + justifikasi. User bisa klik sumber untuk verifikasi sendiri. |

---

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────┐
│  FRONTEND (puraikerto.my.id)            │
│  - index.html (4 grid + artikel)        │
│  - panel-reasoning.js (expandable trace)│
│  - assets/ (logo, animasi, branding)    │
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
│  - curate.py: pilih 9 item/grid/24 jam  │
│  - reason.py: rencana + cross-check     │
│  - article.py: longer-form (on demand)  │
│  - cron tiap 1 jam: rolling update      │
└─────────────────────────────────────────┘
```

**Kenapa M3 via GMI Cloud?**
- Free 14 hari masa kampanye MiniMaxathon
- OpenAI-compatible API (gampang diintegrate)
- Prompt caching aktif → efisien untuk reasoning berulang

---

## 🤖 Persona: bAIwor

bAIwor = transformasi Bawor/Bagong (Punakawan, maskot Kabupaten Banyumas) menjadi AI agent. Berbahasa Indonesia dengan sentuhan Banyumasan saat konteks cocok. Sifat: jujur, lugas, hangat, **transparan** (mau nunjukin reasoning-nya, bukan kasih jawaban tanpa jejak).

Identitas lengkap ada di [`docs/SOUL-bAIwor.md`](docs/SOUL-bAIwor.md).

---

## 🛠️ Sumber data

- **M3 web search** (via GMI Cloud) — penemuan awal, lookup fakta terbaru
- **RSS publik** AI-relevant: Hacker News (front page + AI tag), MIT Tech Review AI, OpenAI blog, Anthropic news, DeepMind blog, arXiv cs.AI
- Cache 24 jam di `api/cache_feed.json`. Item turun dari grid setelah 24 jam (kecuali masuk artikel/blog).

---

## 🚀 Quick start (development)

### Prasyarat
- VPS Linux dengan PHP 8.x + Python 3.11+
- API key GMI Cloud (gratis masa kampanye)
- Domain yang point ke VPS (default: `puraikerto.my.id`)

### Setup

```bash
# 1. clone
git clone https://github.com/wiJang/puraikerto.git
cd puraikerto

# 2. env
cp .env.example .env
# edit .env, isi GMI_API_KEY

# 3. python deps
cd src
pip install -r requirements.txt
cd ..

# 4. cron curate
crontab -e
# tambah:
# 0 * * * * cd /home/wijang/www/puraikerto/src && python3 curate.py >> /home/wijang/logs/puraikerto-curate.log 2>&1

# 5. nginx (sudah dikonfigurasikan di VPS, lihat docs/nginx.conf)
```

Lihat [`docs/SETUP.md`](docs/SETUP.md) untuk detail lengkap.

---

## 📂 Struktur repo

```
puraikerto/
├── README.md                   ← kamu di sini
├── LICENSE
├── .env.example                ← template env (no secrets)
├── .gitignore
├── src/                        ← agent Python
│   ├── curate.py               ← M3 curation engine
│   ├── reason.py               ← M3 reasoning trace generator
│   ├── article.py              ← longer-form generator
│   ├── gmi_client.py           ← wrapper API GMI Cloud
│   ├── prompts/                ← prompt templates
│   └── requirements.txt
├── api/                        ← backend PHP
│   ├── feed.php                ← grid content endpoint
│   ├── reason.php              ← reasoning trace endpoint
│   ├── article.php             ← artikel blog endpoint
│   └── cache_feed.json         ← 24h rolling cache
├── assets/                     ← branding & UI
│   ├── logo.svg
│   ├── style.css               ← neo-brutalist base
│   ├── panel-reasoning.js      ← interactive trace
│   └── animations.css
├── docs/                       ← dokumentasi
│   ├── SETUP.md
│   ├── SOUL-bAIwor.md
│   ├── ARCHITECTURE.md
│   └── CONCEPT.md
├── scripts/                    ← utility scripts
│   ├── deploy.sh               ← git pull + restart
│   └── test-m3.sh              ← test M3 connectivity
└── .github/
    └── workflows/              ← CI/CD (opsional)
```

---

## 📊 Track 1 Reasoning — contoh reasoning trace

Contoh untuk item "GPT-5 rumored release date":

```json
{
  "title": "GPT-5 rumored to launch Q4 2026",
  "trace": [
    {"step": 1, "action": "Identify claim", "result": "Tanggal rilis GPT-5 diklaim Q4 2026 oleh sumber X"},
    {"step": 2, "action": "Check source A (OpenAI blog)", "result": "Tidak ada pengumuman resmi. Pernyataan CEO hanya bilang 'in development'"},
    {"step": 3, "action": "Check source B (Reuters tech)", "result": "Laporan internal sebut 'Q1 2026 sangat kecil kemungkinannya, sumber tidak pasti'"},
    {"step": 4, "action": "Check source C (HN diskusi)", "result": "Spekulasi berdasarkan pola rilis model sebelumnya, bukan fakta"},
    {"step": 5, "action": "Cross-check", "result": "3/3 sumber tidak konfirmasi Q4 2026"},
    {"step": 6, "action": "Conclusion", "result": "KLaim ini spekulatif. Saya tampilkan dengan confidence LOW (35%)"}
  ],
  "confidence": 0.35,
  "sources": ["openai.com/blog", "reuters.com/tech", "news.ycombinator.com"]
}
```

User bisa klik step mana saja untuk lihat detail. **Reasoning trace = jejak audit, bukan sulap.**

---

## 🤝 Kontribusi & lisensi

Project ini dibuat untuk MiniMaxathon (Track 1 — Reasoning). Setelah kontes, license MIT — bebas dipakai, dimodifikasi, didistribusikan.

Lihat [`LICENSE`](LICENSE) untuk detail.

---

## 🔗 Links

- 🌐 Live: https://puraikerto.my.id
- 📰 MiniMaxathon: https://www.gmicloud.ai/minimax-week
- 🤖 MiniMax M3: https://www.gmicloud.ai
- 🏛️ bAIwor identity: [`docs/SOUL-bAIwor.md`](docs/SOUL-bAIwor.md)

---

*Dibuat dengan 🎭 oleh **wijang** + 🤖 oleh **bAIwor (MiniMax M3 via GMI Cloud)***
