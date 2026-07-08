#!/bin/sh
# 日次観測: note 記事のための 1 週間観測（2026-07-07 → 2026-07-14）
#
# 実行: npm run d1:daily
#
# 監視する 4 signals:
# (1) ClaudeBot が /index.md を再取得したか（sitemap lastmod 同期の効果）
# (2) Bingbot が初訪問したか（IndexNow 送信の効果）
# (3) OAI-SearchBot が content を取り始めたか（現状は robots.txt のみ）
# (4) 新 scanner パターンが出現したか（middleware 追加候補）
#
# 記事執筆時に確定させたい数値も同時に出す。

run() {
  echo ""
  echo "==== $1 ===="
  npx wrangler d1 execute ai-ojiichan-logs --remote --command "$2"
}

run "(1) ClaudeBot content 再取得の観測 [直近24h] — 出現していれば sitemap 同期が効いた証拠" "
SELECT timestamp, url_path, status_code
FROM access_logs
WHERE bot_name = 'ClaudeBot'
  AND url_path NOT IN ('/robots.txt', '/sitemap.xml')
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
ORDER BY timestamp DESC"

run "(2) Bingbot 初訪問の観測 [直近7日] — 出現していれば IndexNow の効果" "
SELECT timestamp, url_path, status_code, user_agent
FROM access_logs
WHERE lower(user_agent) LIKE '%bingbot%'
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
ORDER BY timestamp DESC
LIMIT 10"

run "(3) OAI-SearchBot が content を取ったか [直近7日] — robots.txt 以外があれば ChatGPT 検索経路に載り始めた証拠" "
SELECT timestamp, url_path, status_code
FROM access_logs
WHERE bot_name = 'OAI-SearchBot'
  AND url_path != '/robots.txt'
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
ORDER BY timestamp DESC"

run "(4) 新 scanner パターン [直近24h] — 404 上位。繰り返すものは middleware 追加候補" "
SELECT url_path, COUNT(*) AS hits, MAX(timestamp) AS last_seen
FROM access_logs
WHERE status_code = 404
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
GROUP BY url_path
ORDER BY hits DESC
LIMIT 15"

run "(補) 全 bot サマリ [直近24h] — 記事執筆時の数値スナップショット" "
SELECT bot_name, COUNT(*) AS hits,
  SUM(CASE WHEN url_path IN ('/robots.txt', '/sitemap.xml') THEN 1 ELSE 0 END) AS polling,
  SUM(CASE WHEN url_path NOT IN ('/robots.txt', '/sitemap.xml') THEN 1 ELSE 0 END) AS content_hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
GROUP BY bot_name
ORDER BY hits DESC"
