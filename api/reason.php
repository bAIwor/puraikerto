<?php
/**
 * reason.php — purAIkerto reasoning trace endpoint
 *
 * GET /api/reason.php?title=...&url=...  → only allowed if URL is in cache_feed.json
 *                                       → if not in cache: 404 (no M3 call)
 *                                       → if in cache but not in cache_reason.json: generate on the fly (rate-limited)
 *
 * Security notes:
 *   - Only URLs present in api/cache_feed.json are allowed. Random URLs
 *     get 404 — prevents abuse as a free M3 proxy.
 *   - On-the-fly generation is rate-limited per IP (10 requests/min) via a
 *     file-based counter. Hits against the cache are not rate-limited.
 *   - Internal error details are logged to PHP error_log, never returned
 *     to the client.
 *
 * Env vars (set these in nginx/php-fpm pool or /etc/environment):
 *   PURAIKERTO_VENV_PYTHON  path to python3 binary inside the venv
 *   PURAIKERTO_SRC_DIR      path to the src/ directory
 *   PURAIKERTO_RATE_PER_MIN max on-the-fly generations per IP per minute (default 10)
 *   PURAIKERTO_RATE_DIR     where to store rate-limit state files (default /tmp)
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600'); // 10 min
header('X-Content-Type-Options: nosniff');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && preg_match('#^https://([a-z0-9-]+\.)?puraikerto\.my\.id$#i', $origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}

$feed_cache_path  = __DIR__ . '/cache_feed.json';
$trace_cache_path = __DIR__ . '/cache_reason.json';
$title = isset($_GET['title']) ? trim((string) $_GET['title']) : '';
$url   = isset($_GET['url'])   ? trim((string) $_GET['url'])   : '';

if (!$title || !$url) {
    http_response_code(400);
    echo json_encode(['error' => 'missing title or url param'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- 1. URL must be in the current feed cache ----------
// This is the main abuse guard. Random URLs get 404 with no M3 call.
$url_allowed = false;
if (is_file($feed_cache_path)) {
    $raw = file_get_contents($feed_cache_path);
    if ($raw !== false) {
        $feed = json_decode($raw, true);
        if (is_array($feed) && !empty($feed['grids']) && is_array($feed['grids'])) {
            foreach ($feed['grids'] as $items) {
                if (!is_array($items)) continue;
                foreach ($items as $it) {
                    if (isset($it['url']) && $it['url'] === $url) {
                        $url_allowed = true;
                        break 2;
                    }
                }
            }
        }
    }
}
if (!$url_allowed) {
    http_response_code(404);
    echo json_encode(['error' => 'item not in current feed window'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- 2. Try cache_reason.json first (free, no rate limit) ----------
if (is_file($trace_cache_path)) {
    $raw = file_get_contents($trace_cache_path);
    if ($raw !== false) {
        $cache = json_decode($raw, true);
        if (is_array($cache) && !empty($cache['traces']) && is_array($cache['traces'])) {
            foreach ($cache['traces'] as $t) {
                if (isset($t['item_url']) && $t['item_url'] === $url) {
                    echo json_encode($t, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
                    exit;
                }
            }
        }
    }
}

// ---------- 3. Cache miss: rate-limit per IP, then generate on the fly ----------
$rate_dir = getenv('PURAIKERTO_RATE_DIR') ?: '/tmp';
$rate_per_min = (int) (getenv('PURAIKERTO_RATE_PER_MIN') ?: 10);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
// sanitize ip for filename
$ip_safe = preg_replace('/[^a-zA-Z0-9.:_-]/', '_', $ip);
$rate_file = $rate_dir . '/puraikerto_reason_' . $ip_safe;

$now = time();
$window_start = $now - 60;
$count = 0;
$fh = @fopen($rate_file, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $lines = [];
    while (($line = fgets($fh)) !== false) {
        $ts = (int) trim($line);
        if ($ts >= $window_start) $lines[] = $ts;
    }
    $count = count($lines);
    if ($count >= $rate_per_min) {
        flock($fh, LOCK_UN);
        fclose($fh);
        http_response_code(429);
        header('Retry-After: 60');
        echo json_encode(['error' => 'rate limit exceeded'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // record this request
    ftruncate($fh, 0);
    rewind($fh);
    foreach ($lines as $ts) fwrite($fh, $ts . "\n");
    fwrite($fh, $now . "\n");
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
}

// ---------- 4. Generate on the fly via shell ----------
$venv_python = getenv('PURAIKERTO_VENV_PYTHON')
    ?: (getenv('HOME') ? getenv('HOME') . '/www/puraikerto/src/.venv/bin/python3' : '/usr/bin/python3');
$src_dir = getenv('PURAIKERTO_SRC_DIR')
    ?: (getenv('HOME') ? getenv('HOME') . '/www/puraikerto/src' : '');

if (!is_file($venv_python)) {
    error_log("puraikerto reason: venv python not found at $venv_python");
    http_response_code(500);
    echo json_encode(['error' => 'service misconfigured'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!$src_dir || !is_dir($src_dir)) {
    error_log("puraikerto reason: src dir not found: $src_dir");
    http_response_code(500);
    echo json_encode(['error' => 'service misconfigured'], JSON_UNESCAPED_UNICODE);
    exit;
}

$item = json_encode([
    'title'   => $title,
    'url'     => $url,
    'summary' => $_GET['summary'] ?? '',
    'source'  => $_GET['source']  ?? '',
], JSON_UNESCAPED_UNICODE);

$cmd = sprintf(
    'cd %s && GMI_API_KEY=$(grep ^GMI_API_KEY= ~/.hermes/.env 2>/dev/null | head -1 | cut -d= -f2-) %s reason.py --item %s 2>&1',
    escapeshellarg($src_dir),
    escapeshellarg($venv_python),
    escapeshellarg($item)
);
$output = shell_exec($cmd);

if ($output === null) {
    error_log("puraikerto reason: shell_exec returned null for $url");
    http_response_code(500);
    echo json_encode(['error' => 'unable to generate trace, try again later'], JSON_UNESCAPED_UNICODE);
    exit;
}

// last JSON-looking line wins
$lines = explode("\n", trim($output));
$json_line = '';
for ($i = count($lines) - 1; $i >= 0; $i--) {
    if (str_starts_with(trim($lines[$i]), '{')) {
        $json_line = $lines[$i];
        break;
    }
}
if ($json_line) {
    echo $json_line;
    exit;
}

// generation failed — log detail, return generic error
error_log("puraikerto reason: no trace produced for $url | output: " . substr($output, 0, 500));
http_response_code(500);
echo json_encode(['error' => 'unable to generate trace, try again later'], JSON_UNESCAPED_UNICODE);
