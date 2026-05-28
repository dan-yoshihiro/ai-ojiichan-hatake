SELECT
  timestamp,
  url_path,
  country
FROM access_logs
WHERE bot_name = 'GPTBot'
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
ORDER BY timestamp ASC;
