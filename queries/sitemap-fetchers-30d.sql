SELECT
  url_path,
  COALESCE(bot_name, '(未分類)') AS who,
  is_ai_bot,
  is_other_bot,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen,
  GROUP_CONCAT(DISTINCT status_code) AS statuses,
  SUBSTR(MAX(user_agent), 1, 90) AS ua_sample
FROM access_logs
WHERE url_path IN ('/sitemap.xml', '/robots.txt')
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
GROUP BY url_path, who, is_ai_bot, is_other_bot
ORDER BY url_path ASC, hits DESC;
