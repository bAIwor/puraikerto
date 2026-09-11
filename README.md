# purAIkerto

> **Pusat Intelijen & Suara Warga Banyumas & Purwokerto** — Dikurasi & dianalisis oleh **bAIwor** berbasis **MiniMax-M3**, transparan dengan jejak analisis kebijakan dan dampak publik terbuka.

[![Model](https://img.shields.io/badge/MiniMax-M3-ff6b6b)](https://www.gmicloud.ai)
[![Provider](https://img.shields.io/badge/GMI_Cloud-OpenAI_Compatible-4ecdc4)](https://api.gmi-serving.com)
[![Status](https://img.shields.io/badge/Status-100%25_Lokal_Banyumas-green)](#arsitektur-portal)
[![License](https://img.shields.io/badge/license-MIT-green)](#lisensi)

---

## 🏛️ Tentang purAIkerto

**purAIkerto** adalah portal intelijen daerah dan agregator terpadu Banyumas & Purwokerto. Portal ini menyajikan dinamika kebijakan pemerintah daerah, peristiwa aktual, kabar kampus, serta kanal aduan warga dalam satu dasbor terpadu.

Yang membedakan portal ini dari agregator konvensional: **bAIwor (AI Agent berbasis MiniMax-M3) tidak sekadar menampilkan berita, melainkan melakukan analisis kebijakan publik secara transparan**. 

Saat kartu berita atau aduan diklik, terbuka **Inline Drawer** yang memperlihatkan **Analisis Kebijakan & Dampak Warga** langkah demi langkah secara *typewriter streaming*.

---

## 📊 4 Grid Terkurasi (Terkunci Tepat 9 Item per Grid)

Setiap grid dikunci tepat **9 item** (`GRID_ITEMS_COUNT = 9`), tanpa badge eksternal yang mengganggu, dengan data yang diurutkan kronologis:

| Grid | Ikon | Fokus Utama | Sumber Data Aktual |
| :--- | :---: | :--- | :--- |
| **RADAR** | 🏛️ | **Berita Utama Pemkab Banyumas** | API Publik Pemkab Banyumas (`banyumaskab.go.id/berita/get_data_berita`) |
| **SIGNAL** | 📰 | **Media & Peristiwa Lokal Banyumas** | RSS Radar Banyumas & Google News (Kabar Banyumas, Suara Merdeka, Tribun Jateng) |
| **TRACKER** | 🎓 | **Dinamika Kampus & Riset Purwokerto** | Google News Institusi (Unsoed, UMP, Amikom, Telkom Univ, UIN Saizu, UBSI) |
| **PULSE** | 📢 | **Suara & Lapak Aduan Warga** | Lapak Aduan Banyumas (`lapakaduan.banyumaskab.go.id`, hal 1 & 2) |

> [!NOTE]
> Pada grid **PULSE**, setiap aduan warga menampilkan asal kanal pengiriman yang dideteksi parser (`Dikirim via TikTok`, `Dikirim via WhatsApp`, atau `Dikirim via Lapak Aduan`) beserta penanda waktu presisi WIB (contoh: `04 Sep · 14:45 WIB`).

---

## ⚡ Ide 1: Analisis Kebijakan & Dampak Warga

Ketika pengguna mengklik kartu berita atau aduan warga, sistem memuat analisis interaktif dengan 5 elemen inti:

1. 📌 **Inti Masalah (TL;DR):** 1–2 kalimat padat mengenai esensi persoalan, aspirasi warga, atau kebijakan yang dikeluarkan.
2. 🏛️ **Pihak Terkait & Kewenangan:** Pemetaan spesifik OPD/Dinas Pemkab Banyumas (seperti DPU, Dinhub, DLH, Satpol PP, Dinperkim, Dinkes, Disdik, BPBD) atau institusi kampus penanggung jawab beserta rincian peran & kewenangannya.
3. 👥 **Dampak ke Masyarakat & Wilayah:** Poin-poin dampak riil terhadap keselamatan, kelancaran mobilitas, atau dampak ekonomi warga Banyumas.
4. ⚡ **Rekomendasi & Solusi bAIwor:** Saran tindakan cepat (*quick-win* jangka pendek) dan rekomendasi taktis bagi pembuat kebijakan daerah.
5. 📊 **Tingkat Urgensi & Validitas:** Indikator visual progres bar (0–100%) dan label status (*Sangat Mendesak*, *Mendesak*, *Strategis*, *Signifikan*, *Informatif*).

---

## 📝 bAIwor INsights (Artikel Analisis Mendalam)

Selain 4 grid pantauan 24 jam, portal purAIkerto memuat seksi artikel refleksi & eksplorasi mendalam (**bAIwor INsights**) di bagian bawah halaman (`#articles`):
- **Arsip Artikel:** Disimpan dalam format JSON di folder `articles/` (misalnya: `the-soul-of-baiwor.json`, `minimax-week-journey.json`).
- **Endpoint:** Dilayani secara dinamis oleh `api/article.php`.
- **Generator AI:** Artikel dapat diproduksi secara mandiri dengan prompt terstruktur melalui `src/article.py`.

---

## 🏗️ Arsitektur Sistem

```
┌────────────────────────────────────────────────────────┐
│  FRONTEND (Responsive Editorial Brutalist)             │
│  - index.html: 4 Grid x 9 Item, Monitor Statusbar,     │
│    serta seksi bAIwor INsights (Artikel Panjang)       │
│  - assets/panel-reasoning.js: Accordion Typewriter UI  │
│  - assets/style.css: Monokrom Editorial, Border Hitam  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  BACKEND (PHP Dev / Production)                        │
│  - api/feed.php: Mengalirkan cache feed JSON           │
│  - api/reason.php: Endpoint analisis kebijakan M3      │
│  - api/article.php: Endpoint artikel bAIwor INsights   │
│  - api/cache_feed.json: 36 item feed aktif             │
│  - api/cache_reason.json: Pre-generated 36 trace Ide 1 │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  AI AGENT ENGINE (Python 3.11+ / MiniMax-M3)           │
│  - src/curate.py: Fetcher Pemkab, Aduan & Media Lokal  │
│  - src/reason.py: Generator Analisis Kebijakan Ide 1   │
│  - src/article.py: Generator artikel bAIwor INsights   │
│  - src/google_news.py: Utility pencarian Google News   │
│  - src/gmi_client.py: GMI Cloud Client + JSON Repair   │
│  - src/sources.py: Registry query & feed Purwokerto    │
└────────────────────────────────────────────────────────┘
```

---

## 🎭 Persona bAIwor

**bAIwor** terinspirasi dari tokoh **Bawor / Bagong** (Punakawan yang merupakan maskot resmi Kabupaten Banyumas, Jawa Tengah).
- **Karakteristik:** Jujur, cablaka (blak-blakan namun santun), berpihak pada kesejahteraan warga, dan solutif.
- **Misi:** Menjadi jembatan cerdas antara aspirasi warga di akar rumput (*bottom-up*) dan kebijakan birokrasi pemda (*top-down*).

---

## 🚀 Menjalankan Secara Lokal

### Prasyarat
- PHP 8.x
- Python 3.10+
- API Key GMI Cloud (`GMI_API_KEY`) di file `.env`

### Langkah Menjalankan
1. **Konfigurasi Environment:**
   Pastikan file `.env` berada di root direktori proyek:
   ```bash
   GMI_API_KEY="your-gmi-api-key"
   GMI_MODEL="MiniMaxAI/MiniMax-M3"
   ```

2. **Jalankan Web Server Lokal:**
   ```bash
   php -S 0.0.0.0:8000 -t /mnt/c/Hermes/Purwokerto
   # Atau di PowerShell: php -S 0.0.0.0:8000 -t C:\Hermes\Purwokerto
   ```

3. **Buka di Browser:**
   Akses `http://localhost:8000`

### Perintah Pembaruan Data (Opsional)
- **Kurasi Feed Baru:**
  ```bash
  python3 src/curate.py
  ```
- **Pre-generate Analisis Seluruh Grid:**
  ```bash
  python3 src/reason.py --from-cache RADAR --limit 9
  python3 src/reason.py --from-cache SIGNAL --limit 9
  python3 src/reason.py --from-cache TRACKER --limit 9
  python3 src/reason.py --from-cache PULSE --limit 9
  ```
- **Generate Artikel Panjang Baru:**
  ```bash
  python3 src/article.py --topic "Evaluasi Infrastruktur Jalan Banyumas 2026"
  ```
- **Uji Konektivitas Model MiniMax:**
  ```bash
  bash scripts/test-m3.sh
  ```

---

## 📂 Struktur Direktori

```
C:\Hermes\Purwokerto\
├── README.md                   ← Dokumentasi proyek ini
├── .env                        ← Konfigurasi API key lokal
├── index.html                  ← Dasbor portal 4 grid & seksi artikel
├── api/                        ← Endpoint & cache JSON
│   ├── cache_feed.json         ← Feed 36 item (4 grid x 9 item)
│   ├── cache_reason.json       ← Cache analisis kebijakan 36 item
│   ├── feed.php                ← Endpoint delivery feed
│   ├── reason.php              ← Endpoint delivery analisis kebijakan
│   └── article.php             ← Endpoint delivery artikel INsights
├── articles/                   ← Data artikel analisis mendalam (JSON)
│   ├── the-soul-of-baiwor.json
│   └── minimax-week-journey.json
├── assets/                     ← Styling & Skrip Frontend
│   ├── style.css               ← Editorial brutalist stylesheet
│   └── panel-reasoning.js      ← Typewriter drawer & accordion engine
├── docs/                       ← Dokumentasi filosofi & teknis
│   ├── CONCEPT.md              ← Konsep awal & visi portal
│   ├── SETUP.md                ← Panduan deployment server/VPS
│   └── SOUL-bAIwor.md          ← Persona, etika & karakter bAIwor
├── scripts/                    ← Skrip operasional
│   └── test-m3.sh              ← Tes konektivitas API MiniMax M3
└── src/                        ← Python AI Engine
    ├── curate.py               ← Kurasi scraping & filter lokal
    ├── reason.py               ← Generator Analisis Kebijakan Ide 1
    ├── article.py              ← Generator artikel mendalam bAIwor
    ├── google_news.py          ← Helper pencarian Google News RSS
    ├── gmi_client.py           ← Client GMI Cloud & auto-repair JSON
    ├── sources.py              ← Sumber API Pemkab & query berita
    └── requirements.txt        ← Dependensi Python
```

---

## 📜 Lisensi

MIT License — Bebas digunakan, dikembangkan, dan disesuaikan untuk kemajuan keterbukaan informasi publik daerah.
