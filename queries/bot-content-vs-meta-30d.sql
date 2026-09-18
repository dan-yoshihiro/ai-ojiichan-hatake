SELECT
  bot_name,
  CASE
    WHEN url_path IN ('/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt') THEN '1_メタ'
    ELSE '2_本文'
  END AS kind,
  COUNT(*) AS hits,
  COUNT(DISTINCT url_path) AS paths,
  MIN(timestamp) AS first_seen,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
GROUP BY bot_name, kind
ORDER BY bot_name ASC, kind ASC;
