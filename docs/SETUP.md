# Setup — purAIkerto (production on VPS)

> Full setup guide for deploying purAIkerto to a VPS. Assumes Ubuntu + nginx + PHP-FPM + Python 3.11+.

> **Note**: this guide uses `/var/www/puraikerto` as the example path. Adjust to your own server layout — pick a directory your web user can read.

---

## 1. VPS prerequisites

```bash
# check
nginx -v
php -v
python3 --version
# optional: pm2, cron
```

If anything is missing, install via the package manager:

```bash
sudo apt update
sudo apt install -y nginx php-fpm python3 python3-pip python3-venv
```

---

## 2. Clone the repo

```bash
sudo mkdir -p /var/www
sudo chown $USER:www-data /var/www
cd /var/www
git clone https://github.com/bAIwor/puraikerto.git
cd puraikerto
```

---

## 3. Environment variables

`GMI_API_KEY` is required. The expected location is `~/.hermes/.env` (a common convention), but `curate.py` and `reason.py` read it via `python-dotenv` + `os.environ`, so any of these work:

- `~/.hermes/.env` (the default lookup)
- `~/.env`
- A project-local `.env` (copy from `.env.example`)
- An exported shell variable

Make sure the line is set:

```
GMI_API_KEY=gmi_xxxxx...
GMI_BASE_URL=https://api.gmi-serving.com/v1
GMI_MODEL=MiniMaxAI/MiniMax-M3
```

Verify:

```bash
grep ^GMI_API_KEY= ~/.hermes/.env | head -1
# test connectivity
bash scripts/test-m3.sh
```

---

## 4. Python dependencies

```bash
cd /var/www/puraikerto/src
pip install --user -r requirements.txt
# or with venv (recommended for production):
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 5. Nginx config

Add a site config (or include it in the existing file):

```nginx
server {
    server_name puraikerto.my.id;
    root /var/www/puraikerto;
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
            fastcgi_pass unix:/run/php/php8.5-fpm.sock;  # adjust version
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

Add:

```cron
# purAIkerto curation — rolling 24h window
0 * * * * cd /var/www/puraikerto/src && /usr/bin/python3 curate.py --cache /var/www/puraikerto/api/cache_feed.json >> /var/log/puraikerto-curate.log 2>&1

# purAIkerto reasoning trace — top 3 per grid, every 6 hours
0 */6 * * * cd /var/www/puraikerto/src && /usr/bin/python3 reason.py --from-cache RADAR --limit 3 --out /var/www/puraikerto/api/cache_reason.json >> /var/log/puraikerto-reason.log 2>&1
```

> Note: `crontab` does not load `~/.bashrc` — the `GMI_API_KEY` env var must be exported inline or set in the crontab line.

---

## 7. First-time test

```bash
# 1. test M3 connectivity
bash scripts/test-m3.sh

# 2. run curation (manual, dry-run first)
cd /var/www/puraikerto/src
python3 curate.py --dry-run

# 3. run curation (live, will call M3)
python3 curate.py

# 4. check output
cat /var/www/puraikerto/api/cache_feed.json | head -50

# 5. reason about RADAR top 3
python3 reason.py --from-cache RADAR --limit 3

# 6. test endpoint
curl -s http://localhost/api/feed.php | head -30
curl -s "http://localhost/api/reason.php?title=test&url=https://example.com" | head -30
```

---

## 8. Cloudflare (or any reverse proxy)

The example assumes the domain `puraikerto.my.id` resolves to the VPS (port 80/443) via Cloudflare or similar. Configure your DNS / tunnel to point there.

---

## 9. Monitoring

Useful log files:
- `/var/log/puraikerto-curate.log` — output of the curate cron
- `/var/log/puraikerto-reason.log` — output of the reason cron
- nginx access/error: `/var/log/nginx/`

Quick health check:

```bash
curl -sI https://puraikerto.my.id
curl -s https://puraikerto.my.id/api/feed.php | python3 -c "import json,sys;d=json.load(sys.stdin);print('grids:',list(d.get('grids',{}).keys()))"
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `GMIError: GMI_API_KEY not set` | Make sure the line is in `~/.hermes/.env` and the script can read it. Cron sometimes needs `env` on the crontab line. |
| `cache_feed.json` has 0 grids | Check the curate log. M3 may be timing out — increase the timeout in `gmi_client.py`. |
| 403 Forbidden | `index.html` is missing from the root, or `try_files` in nginx is wrong. |
| 502 Bad Gateway | PHP-FPM is not running. `systemctl --user status php8.5-fpm` (check user scope). |
| Reasoning panel stuck loading | Check `/api/reason.php` can be called manually, and `shell_exec` is enabled in `php.ini`. |
