/*
 * 人間候補の7日サマリー。
 * unique_ip_candidates はユニーク IP であり、訪問者の実人数ではない。
 */
SELECT
  COUNT(*) AS human_candidate_pageviews,
  COUNT(DISTINCT ip_hash) AS unique_ip_candidates,
  COUNT(DISTINCT DATE(timestamp) || ':' || ip_hash) AS daily_unique_ip_candidates,
  COUNT(DISTINCT url_path) AS viewed_paths
FROM access_logs
WHERE is_ai_bot = 0
  AND COALESCE(is_other_bot, 0) = 0
  AND COALESCE(status_code, 200) = 200
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
  AND (
    url_path = '/'
    OR url_path LIKE '%.md'
    OR url_path LIKE '%.md?%'
    OR url_path LIKE '/llms%.txt'
    OR url_path LIKE '/llms%.txt?%'
  );
