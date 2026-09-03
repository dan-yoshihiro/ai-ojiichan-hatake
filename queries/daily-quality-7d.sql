/*
 * 日次トラフィックの質。
 * human_candidate_pageviews は、既知の機械アクセスと失敗応答を除いた候補値であり、人間確定値ではない。
 * content_requests は bot を含む正規コンテンツへの全リクエストであり、人間閲覧数として使わない。
 */
SELECT
  DATE(timestamp) AS day,
  COUNT(*) AS total,
  SUM(CASE WHEN is_ai_bot = 1 THEN 1 ELSE 0 END) AS ai,
  SUM(CASE WHEN is_ai_bot = 0 AND COALESCE(is_other_bot, 0) = 0 THEN 1 ELSE 0 END) AS human_candidates_or_unknown,
  SUM(
    CASE
      WHEN is_ai_bot = 0
        AND COALESCE(is_other_bot, 0) = 0
        AND COALESCE(status_code, 200) = 200
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
  ) AS human_candidate_pageviews,
  SUM(
    CASE
      WHEN COALESCE(status_code, 200) = 200
        AND (
          url_path = '/'
          OR url_path LIKE '%.md'
          OR url_path LIKE '%.md?%'
          OR url_path LIKE '/llms%.txt'
          OR url_path LIKE '/llms%.txt?%'
        )
      THEN 1 ELSE 0
    END
  ) AS content_requests
FROM access_logs
WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY DATE(timestamp)
ORDER BY day DESC;
