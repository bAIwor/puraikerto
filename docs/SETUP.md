# Setup — purAIkerto (production on VPS)

> Panduan setup lengkap untuk deploy purAIkerto ke VPS. Asumsi: VPS sudah jalan Ubuntu + nginx + PHP-FPM + Python 3.11+, sama seperti setup SIMDATA.

---

## 1. Prasyarat di VPS

```bash
# cek
nginx -v
php -v
python3 --version
# opsional: pm2, cron
```

Kalau ada yang kurang, install via package manager. Contoh:

```bash
sudo apt update
sudo apt install -y nginx php-fpm python3 python3-pip python3-venv
```

---

## 2. Clone repo

```bash
cd /home/wijang/www
git clone https://github.com/bAIwor/puraikerto.git
cd puraikerto
```

(Repo ini di-upload di organisasi **bAIwor**, bukan akun personal — sesuai konvensi `wijang.md`.)

---

## 3. Setup environment variables

`GMI_API_KEY` harus di-load dari `~/.hermes/.env` (sudah ada di VPS). `curate.py` dan `reason.py` baca via `python-dotenv` + `os.environ`.

Pastikan baris ini ada di `~/.hermes/.env`:

```
GMI_API_KEY=gmi_xxxxx...
GMI_BASE_URL=https://api.gmi-serving.com/v1
GMI_MODEL=MiniMaxAI/MiniMax-M3
```

Verifikasi:

```bash
grep ^GMI_API_KEY= ~/.hermes/.env | head -1
# test
bash scripts/test-m3.sh
```

---

## 4. Python dependencies

```bash
cd /home/wijang/www/puraikerto/src
pip install --user -r requirements.txt
# atau pake venv (recommended):
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 5. Konfigurasi nginx

Tambah site config (atau include dari file existing):

```nginx
server {
    server_name puraikerto.my.id;
    root /home/wijang/www/puraikerto;
    index index.html;

    # security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # static cache
    location ~* \.(css|js|svg|png|jpg|ico)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # API endpoints
    location /api/ {
        try_files $uri $uri/ /api/$uri.php?$args;
        location ~ \.php$ {
            include fastcgi_params;
            fastcgi_pass unix:/run/php/php8.5-fpm.sock;  # sesuaikan versi
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        }
    }

    # everything else → index.html (SPA-friendly)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # PHP fallback
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.5-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Cron curation

```bash
crontab -e
```

Tambah:

```cron
# purAIkerto curation — rolling 24h window
0 * * * * cd /home/wijang/www/puraikerto/src && /usr/bin/python3 curate.py --cache /home/wijang/www/puraikerto/api/cache_feed.json >> /home/wijang/logs/puraikerto-curate.log 2>&1

# purAIkerto reasoning trace — top 3 per grid, sekali per 6 jam
0 */6 * * * cd /home/wijang/www/puraikerto/src && /usr/bin/python3 reason.py --from-cache RADAR --limit 3 --out /home/wijang/www/puraikerto/api/cache_reason.json >> /home/wijang/logs/puraikerto-reason.log 2>&1
```

> Catatan: `crontab` tidak load `~/.bashrc` — env `GMI_API_KEY` harus di-export inline atau diset di crontab.

---

## 7. Test pertama kali

```bash
# 1. test M3 connectivity
bash scripts/test-m3.sh

# 2. run curation (manual, dry-run dulu)
cd /home/wijang/www/puraikerto/src
python3 curate.py --dry-run

# 3. run curation (live, will call M3)
python3 curate.py

# 4. cek output
cat /home/wijang/www/puraikerto/api/cache_feed.json | head -50

# 5. reason about RADAR top 3
python3 reason.py --from-cache RADAR --limit 3

# 6. test endpoint
curl -s http://localhost/api/feed.php | head -30
curl -s "http://localhost/api/reason.php?title=test&url=https://example.com" | head -30
```

---

## 8. Cloudflare

Sudah ada tunnel `baiworweb` yang route `puraikerto.my.id`. Pastikan ingress `puraikerto.my.id` di dashboard Cloudflare point ke VPS nginx (port 80 / 443).

---

## 9. Monitoring

Log file yang berguna:
- `/home/wijang/logs/puraikerto-curate.log` — output cron curate
- `/home/wijang/logs/puraikerto-reason.log` — output cron reason
- nginx access/error: `/var/log/nginx/`

Quick health check:

```bash
curl -sI https://puraikerto.my.id
curl -s https://puraikerto.my.id/api/feed.php | python3 -c "import json,sys;d=json.load(sys.stdin);print('grids:',list(d.get('grids',{}).keys()))"
```

---

## Troubleshooting

| Gejala | Fix |
|---|---|
| `GMIError: GMI_API_KEY not set` | Pastikan baris di `~/.hermes/.env`, dan script bisa baca. Cron kadang butuh `env` di crontab line. |
| `cache_feed.json` 0 grids | Cek log curate. M3 mungkin timeout — tambah timeout di `gmi_client.py`. |
| 403 Forbidden | Index.html belum ada di root / `try_files` di nginx salah. |
| 502 Bad Gateway | PHP-FPM tidak jalan. `systemctl --user status php8.5-fpm` (cek user scope). |
| Reasoning panel stuck loading | Cek `/api/reason.php` bisa di-call manual, cek `shell_exec` enabled di `php.ini`. |
