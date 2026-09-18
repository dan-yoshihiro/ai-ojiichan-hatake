SELECT
  timestamp,
  url_path,
  status_code,
  COALESCE(bot_name, '(未分類)') AS who,
  is_ai_bot,
  is_other_bot,
  country,
  user_agent
FROM access_logs
WHERE url_path = '/sitemap.xml'
  AND bot_name IS NULL
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
ORDER BY timestamp DESC;
