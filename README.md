# purAIkerto

> **Pusat Intelijen & Suara Warga Banyumas & Purwokerto** — Dikurasi & dianalisis oleh **bAIwor** bertenaga **Hermes Agent Engine**, transparan dengan jejak analisis kebijakan dan dampak publik terbuka.

[![Live](https://img.shields.io/badge/Live-puraikerto.my.id-blue)](https://puraikerto.my.id)
[![Engine](https://img.shields.io/badge/Engine-Hermes_Agent_CLI-7928ca)](https://puraikerto.my.id)
[![Status](https://img.shields.io/badge/Status-100%25_Lokal_Banyumas-green)](#arsitektur-sistem)
[![License](https://img.shields.io/badge/license-MIT-green)](#lisensi)

---

## 🏛️ Tentang purAIkerto

**purAIkerto** (`puraikerto.my.id`) adalah portal intelijen daerah dan agregator terpadu Kabupaten Banyumas & Purwokerto. Portal ini memonitor dinamika kebijakan pemerintah daerah, peristiwa aktual, kabar pendidikan & kampus, serta saluran aduan warga dalam satu dasbor terpadu.

Berbeda dari agregator berita konvensional: **bAIwor** (persona AI berbasis Hermes Agent) menyaring kebisingan informasi (*noise*) dan menyajikan analisis kebijakan publik secara transparan. Saat kartu berita atau aduan warga diklik, sistem membuka **Inline Drawer** yang menampilkan pemetaan OPD, dampak warga, dan rekomendasi taktis secara interaktif.

---

## 📊 4 Grid Terkurasi (9 Item per Grid)

Setiap siklus kurasi mengumpulkan ratusan data mentah dari sumber primer dan sekunder Banyumas, lalu dikurasi menjadi **tepat 9 item terbaik** per grid (`GRID_ITEMS_COUNT = 9`):

| Grid | Ikon | Fokus Liputan | Sumber Data Aktual | Metode Pengambilan |
| :--- | :---: | :--- | :--- | :--- |
| **RADAR** | 🏛️ | **Berita Utama Pemkab Banyumas** | Portal Resmi Pemkab Banyumas (`banyumaskab.go.id/berita/get_data_berita`) | AJAX API POST (Kategori `utama`, pool ~30 item) |
| **SIGNAL** | 📰 | **Media & Peristiwa Lokal Banyumas** | Radar Banyumas, Suara Merdeka, Tribun Jateng / Banyumas | RSS Feed & Google News RSS (`Banyumas OR Purwokerto`, pool ~95 item) |
| **TRACKER** | 🎓 | **Dinamika Kampus & Riset Purwokerto** | 6 Perguruan Tinggi: Unsoed, UMP, Amikom, Telkom Univ/SMK, UIN Saizu, UBSI | Targeted Google News RSS per institusi (pool ~150 item) |
| **PULSE** | 📢 | **Suara & Lapak Aduan Warga** | Portal Lapak Aduan Banyumas (`lapakaduan.banyumaskab.go.id`) | Web Parser (Aduan warga via WhatsApp / Web, pool ~20 item) |

---

## ⚡ Analisis Kebijakan & Dampak Warga

Ketika pengguna mengklik kartu pada grid, sistem memuat jejak penalaran bAIwor dengan komponen analitis:

1. 📌 **Inti Masalah (TL;DR):** Esensi persoalan, aspirasi warga, atau kebijakan yang dikeluarkan dalam 1–2 kalimat padat.
2. 🏛️ **Pihak Terkait & Kewenangan:** Identifikasi OPD/Dinas teknis Pemkab Banyumas (misal: DPU, Dinhub, DLH, Satpol PP, Dinkes, Disdik, BPBD) atau institusi kampus penanggung jawab.
3. 👥 **Dampak ke Masyarakat & Wilayah:** Poin dampak riil terhadap keselamatan, mobilitas, atau perputaran ekonomi warga.
4. ⚡ **Rekomendasi & Solusi bAIwor:** Rekomendasi tindakan cepat (*quick-win*) serta solusi strategis jangka menengah.
5. 📊 **Tingkat Urgensi & Keyakinan:** Indikator tingkat kepentingan (*Sangat Mendesak*, *Mendesak*, *Strategis*, *Signifikan*, *Informatif*).

---

## 🤖 AI Backend & Kurasi (Hermes Agent)

Mesin kurasi dan penalaran bAIwor sepenuhnya didelegasikan ke **Hermes Agent CLI** (`hermes chat --oneshot`):
- **Zero API Key Overhead:** Aplikasi tidak menyimpan kredensial pihak ketiga secara langsung.
- **Fleksibel & Otonom:** Mengikuti model dan profil aktif yang dikelola oleh Hermes di server VPS.
- **Fail-Safe Fallback:** Memiliki penanganan retry otomatis dan isolasi sesi per query.

---

## 🏗️ Arsitektur Sistem

```
┌────────────────────────────────────────────────────────┐
│  FRONTEND (Editorial Neo-Brutalist)                    │
│  - index.html: 4 Grid x 9 Item, Monitor Statusbar      │
│  - assets/panel-reasoning.js: Drawer & Reason Renderer │
│  - assets/style.css: Monokrom Editorial, Border Solid  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  BACKEND (PHP Web Service)                             │
│  - api/feed.php: Mengalirkan cache feed JSON           │
│  - api/reason.php: Endpoint penalaran & analisis OPD   │
│  - api/cache_feed.json: 36 item feed aktif             │
│  - api/cache_reason.json: Pre-warmed cache penalaran   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  AI AGENT ENGINE (Python 3.11+ / Hermes CLI)           │
│  - src/curate.py: Scraper, normalisasi & kurasi 4 grid │
│  - src/reason.py: Generator analisis kebijakan publik  │
│  - src/sources.py: Registry konfigurasi sumber Banyumas│
│  - src/google_news.py: Utility parser Google News RSS  │
│  - src/llm_client.py: Hermes CLI Subprocess Bridge     │
└────────────────────────────────────────────────────────┘
```

---

## 🎭 Persona bAIwor

**bAIwor** terinspirasi dari tokoh **Bawor / Bagong** (Punakawan maskot kebanggaan Kabupaten Banyumas, Jawa Tengah).
- **Karakter:** Jujur, cablaka (lugas, blak-blakan namun santun), dan berpihak pada kepentingan warga.
- **Fungsi:** Menjadi jembatan cerdas antara aspirasi riil warga di akar rumput (*bottom-up*) dan kebijakan birokrasi pemda (*top-down*).

---

## 🚀 Menjalankan & Memperbarui Data

### Jalankan Kurasi Manual
Di server VPS (atau lingkungan yang memiliki Hermes):
```bash
cd /home/wijang/www/puraikerto
source src/.venv/bin/activate
python3 src/curate.py
```

### Pre-warm Penalaran (Reasoning Trace)
```bash
python3 src/reason.py --from-cache RADAR --limit 9
python3 src/reason.py --from-cache SIGNAL --limit 9
python3 src/reason.py --from-cache TRACKER --limit 9
python3 src/reason.py --from-cache PULSE --limit 9
```

---

## 📂 Struktur Direktori

```
puraikerto/
├── README.md                   ← Dokumentasi arsitektur portal ini
├── LICENSE                     ← Lisensi open-source (MIT)
├── index.html                  ← Dasbor portal 4 grid & status monitor
├── nginx.conf                  ← Contoh konfigurasi Nginx production
├── api/                        ← Endpoint & cache JSON
│   ├── cache_feed.json         ← Feed terkurasi (4 grid x 9 item)
│   ├── cache_reason.json       ← Cache analisis kebijakan terverifikasi
│   ├── feed.php                ← Endpoint API feed publik
│   └── reason.php              ← Endpoint API analisis interaktif
├── assets/                     ← Aset Frontend
│   ├── favicon.svg             ← Ikon brand purAIkerto
│   ├── style.css               ← Stylesheet Brutalist editorial
│   └── panel-reasoning.js      ← Engine drawer & rendering reasoning
└── src/                        ← Mesin Pemrosesan & Kurasi Python
    ├── curate.py               ← Pipeline pengumpulan & pemilihan 4 grid
    ├── reason.py               ← Pipeline analisis kebijakan per item
    ├── sources.py              ← Definisi API Pemkab & query media lokal
    ├── google_news.py          ← Helper RSS parser Google News
    ├── llm_client.py           ← Adapter Hermes Agent CLI (`hermes chat`)
    └── requirements.txt        ← Dependensi Python
```

---

## 📜 Lisensi

MIT License — Bebas digunakan dan dikembangkan untuk mendukung keterbukaan informasi publik dan digitalisasi daerah Kabupaten Banyumas.
