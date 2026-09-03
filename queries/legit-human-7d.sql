/*
 * 人間候補のコンテンツ閲覧（直近7日）。
 * サーバーリクエストだけで「人間」は断定できないため、結果は人間候補として扱う。
 * AI bot / 一般 bot / 失敗応答 / scanner probe を除外し、実コンテンツの 200 応答だけを集計する。
 * unique_ip_candidates は同一ネットワーク（NAT）を一人にまとめることもあるため、人数ではない。
 */
SELECT
  url_path,
  COUNT(*) AS human_candidate_pageviews,
  COUNT(DISTINCT ip_hash) AS unique_ip_candidates,
  MAX(timestamp) AS last_seen
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
  )
GROUP BY url_path
ORDER BY human_candidate_pageviews DESC;
