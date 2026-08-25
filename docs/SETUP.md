# Setup — purAIkerto (production on VPS)

> Full setup guide for deploying purAIkerto to a VPS. Assumes Ubuntu + nginx + PHP-FPM + Python 3.11+, similar to the SIMDATA setup.

---

## 1. VPS prerequisites

```bash
# check
nginx -v
php -v
python3 --version
# optional: pm2, cron
```

If anything is missing, install via the package manager. Example:

```bash
sudo apt update
sudo apt install -y nginx php-fpm python3 python3-pip python3-venv
```

---

## 2. Clone the repo

```bash
cd /home/wijang/www
git clone https://github.com/bAIwor/puraikerto.git
cd puraikerto
```

(Repo is hosted under the **bAIwor** organization, not a personal account — per the `wijang.md` convention.)

---

## 3. Environment variables

`GMI_API_KEY` is loaded from `~/.hermes/.env` (already exists on the VPS). `curate.py` and `reason.py` read it via `python-dotenv` + `os.environ`.

Make sure this line is in `~/.hermes/.env`:

```
GMI_API_KEY=gmi_xxxxx...
GMI_BASE_URL=https://api.gmi-serving.com/v1
GMI_MODEL=MiniMaxAI/MiniMax-M3
```

Verify:

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
# or with venv (recommended):
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
0 * * * * cd /home/wijang/www/puraikerto/src && /usr/bin/python3 curate.py --cache /home/wijang/www/puraikerto/api/cache_feed.json >> /home/wijang/logs/puraikerto-curate.log 2>&1

# purAIkerto reasoning trace — top 3 per grid, every 6 hours
0 */6 * * * cd /home/wijang/www/puraikerto/src && /usr/bin/python3 reason.py --from-cache RADAR --limit 3 --out /home/wijang/www/puraikerto/api/cache_reason.json >> /home/wijang/logs/puraikerto-reason.log 2>&1
```

> Note: `crontab` does not load `~/.bashrc` — the `GMI_API_KEY` env var must be exported inline or set in the crontab line.

---

## 7. First-time test

```bash
# 1. test M3 connectivity
bash scripts/test-m3.sh

# 2. run curation (manual, dry-run first)
cd /home/wijang/www/puraikerto/src
python3 curate.py --dry-run

# 3. run curation (live, will call M3)
python3 curate.py

# 4. check output
cat /home/wijang/www/puraikerto/api/cache_feed.json | head -50

# 5. reason about RADAR top 3
python3 reason.py --from-cache RADAR --limit 3

# 6. test endpoint
curl -s http://localhost/api/feed.php | head -30
curl -s "http://localhost/api/reason.php?title=test&url=https://example.com" | head -30
```

---

## 8. Cloudflare

The `baiworweb` tunnel is already configured to route `puraikerto.my.id`. Make sure the `puraikerto.my.id` ingress in the Cloudflare dashboard points to the VPS nginx (port 80 / 443).

---

## 9. Monitoring

Useful log files:
- `/home/wijang/logs/puraikerto-curate.log` — output of the curate cron
- `/home/wijang/logs/puraikerto-reason.log` — output of the reason cron
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
