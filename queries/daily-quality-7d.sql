/* 日次トラフィックの質。content_views = 正規コンテンツ path のみ数える allowlist 方式（スキャナー probe 除外）。2026-06-20 denylist→allowlist に変更 */
SELECT
  DATE(timestamp) AS day,
  COUNT(*) AS total,
  SUM(CASE WHEN is_ai_bot = 1 THEN 1 ELSE 0 END) AS ai,
  SUM(CASE WHEN is_ai_bot = 0 THEN 1 ELSE 0 END) AS humans_or_scanners,
  SUM(
    CASE
      WHEN is_ai_bot = 0
        AND (
          url_path = '/'
          OR url_path LIKE '%.md'
          OR url_path LIKE '%.md?%'
          OR url_path LIKE '/llms%.txt'
          OR url_path LIKE '/llms%.txt?%'
        )
      THEN 1
      ELSE 0
    END
  ) AS content_views
FROM access_logs
WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY DATE(timestamp)
ORDER BY day DESC;
