<?php
/**
 * feed.php — purAIkerto grid content endpoint
 *
 * GET /api/feed.php            → all 4 grids (from cache_feed.json)
 * GET /api/feed.php?grid=RADAR → only one grid
 * GET /api/feed.php?nocache=1  → ignore any HTTP cache (handled by PHP, not us)
 *
 * Output: JSON with shape
 *   {
 *     "generated_at": "...",
 *     "ttl_hours": 24,
 *     "source_count": 6,
 *     "item_count": 87,
 *     "grids": { "RADAR": [...], "SIGNAL": [...], "TRACKER": [...], "PULSE": [...] }
 *   }
 *
 * Each item: { title, url, source, summary, published, confidence, reason, blurb }
 *
 * Robustness:
 *   - If cache missing or malformed → return empty grids (frontend shows empty state)
 *   - Same-tab friendly CORS for our own origin
 *   - No auth needed: this is public read-only content
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300'); // 5 min browser cache
header('X-Content-Type-Options: nosniff');

// CORS: only same-origin (puraikerto.my.id) and preview
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && preg_match('#^https://([a-z0-9-]+\.)?puraikerto\.my\.id$#i', $origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}

$cache_path = __DIR__ . '/cache_feed.json';
$grid_filter = isset($_GET['grid']) ? strtoupper(trim((string) $_GET['grid'])) : null;

if (!is_file($cache_path)) {
    http_response_code(503);
    echo json_encode([
        'error' => 'cache not ready',
        'detail' => 'curation agent has not run yet — check back in a few minutes',
        'generated_at' => null,
        'grids' => new stdClass(),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$raw = file_get_contents($cache_path);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['error' => 'cache read failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(500);
    echo json_encode(['error' => 'cache corrupt'], JSON_UNESCAPED_UNICODE);
    exit;
}

// filter if asked
if ($grid_filter && in_array($grid_filter, ['RADAR', 'SIGNAL', 'TRACKER', 'PULSE'], true)) {
    $payload['grids'] = isset($payload['grids'][$grid_filter])
        ? [$grid_filter => $payload['grids'][$grid_filter]]
        : [];
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
