#!/bin/sh
# 週次 D1 分析（2026-07-06 新設・status_code / is_other_bot 対応版）
#
# 実行: npm run d1:weekly （または sh queries/weekly-analysis.sh）
#
# なぜ .sql 一括ファイルでなく script か:
# - wrangler d1 execute --file は複数文だと import 経路になり結果テーブルが表示されない
# - ターミナル直貼りだと zsh が「# (N)」コメントをグロブ解釈してエラーになる
#
# 注意:
# - 2026-07-06T14:39 以前のレコードは status_code = NULL・is_other_bot = 0（移行前）。
#   「人間」判定が信頼できるのは 2026-07-06 以降のデータのみ
# - 既知 scanner パターンは middleware が記録前に 404 で弾くため、ここに出るのは
#   「未知パターン」か「正規アクセス」のどちらか

run() {
  echo ""
  echo "===================================================="
  echo "$1"
  echo "===================================================="
  npx wrangler d1 execute ai-ojiichan-logs --remote --command "$2"
}

run "(1) 日次の質: AI bot / その他 bot / 人間 + 人間の実コンテンツ閲覧（7日）" "
SELECT
  DATE(timestamp) AS day,
  COUNT(*) AS total,
  SUM(is_ai_bot) AS ai_bot,
  SUM(is_other_bot) AS other_bot,
  SUM(CASE WHEN is_ai_bot = 0 AND is_other_bot = 0 THEN 1 ELSE 0 END) AS human,
  SUM(CASE WHEN is_ai_bot = 0 AND is_other_bot = 0 AND status_code = 200
        AND (url_path = '/' OR url_path LIKE '%.md' OR url_path LIKE '%.md?%' OR url_path LIKE '/llms%.txt')
      THEN 1 ELSE 0 END) AS human_content_view
FROM access_logs
WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY DATE(timestamp)
ORDER BY day DESC"

run "(2) AI bot 別: robots/sitemap ポーリングと content 取得を分けて集計（7日）" "
SELECT
  bot_name,
  COUNT(*) AS hits,
  SUM(CASE WHEN url_path IN ('/robots.txt', '/sitemap.xml') THEN 1 ELSE 0 END) AS polling,
  SUM(CASE WHEN url_path NOT IN ('/robots.txt', '/sitemap.xml') THEN 1 ELSE 0 END) AS content_hits,
  COUNT(DISTINCT url_path) AS unique_pages,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY bot_name
ORDER BY hits DESC"

run "(3) AI bot の content 再取得ログ（7日）: sitemap lastmod 同期の効果測定" "
SELECT
  bot_name,
  url_path,
  status_code,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
  AND url_path NOT IN ('/robots.txt', '/sitemap.xml')
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY bot_name, url_path
ORDER BY bot_name, last_seen DESC"

run "(4) 人間が読んだ記事（7日）: AI でも機械でもない + 200 のみ" "
SELECT
  url_path,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 0
  AND is_other_bot = 0
  AND status_code = 200
  AND (url_path = '/' OR url_path LIKE '%.md' OR url_path LIKE '%.md?%' OR url_path LIKE '/llms%.txt')
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY url_path
ORDER BY hits DESC"

run "(5) 露出漏れ警報（7日）: 正規 content 以外に 200 を返したパス。何か出たら即対応" "
SELECT
  url_path,
  status_code,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE status_code = 200
  AND url_path NOT IN ('/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt',
                       '/LICENSE', '/DEPLOYMENT.md', '/index.md',
                       '/.well-known/security.txt',
                       '/7b01cad7f5e8511cbccdca2f33065357.txt')
  AND url_path NOT LIKE '/docs/%'
  AND url_path NOT LIKE '/index.md?%'
  AND url_path NOT LIKE '/DEPLOYMENT.md?%'
  AND url_path NOT LIKE '/LICENSE?%'
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY url_path
ORDER BY hits DESC
LIMIT 20"

run "(6) 未知 scanner パターン観察（7日）: 404 上位。繰り返すものは isScannerNoisePath 追加候補" "
SELECT
  url_path,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE status_code = 404
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY url_path
ORDER BY hits DESC
LIMIT 20"
