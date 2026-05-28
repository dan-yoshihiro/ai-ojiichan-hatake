SELECT
  bot_name,
  COUNT(*) AS hits,
  COUNT(DISTINCT url_path) AS pages,
  MIN(timestamp) AS first_seen,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY bot_name
ORDER BY hits DESC;
