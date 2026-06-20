/* 実コンテンツ閲覧のみ allowlist 方式（ルート / *.md / *.md?view / llms*.txt）。スキャナーは数百種の probe path を打つため denylist 不可・2026-06-20 */
SELECT
  url_path,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 0
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
  AND (
    url_path = '/'
    OR url_path LIKE '%.md'
    OR url_path LIKE '%.md?%'
    OR url_path LIKE '/llms%.txt'
    OR url_path LIKE '/llms%.txt?%'
  )
GROUP BY url_path
ORDER BY hits DESC;
