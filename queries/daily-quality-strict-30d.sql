/* 過去30日 日次トラフィックを user_agent パターンで bot 再判定して再集計する。
   2026-06-27: middleware の is_ai_bot 判定に Googlebot 系（Googlebot Desktop/Smartphone, Google-Extended, Google-InspectionTool）が漏れていた既知バグへの対処。
   middleware 修正後も過去ログの is_ai_bot 列は更新されないため、user_agent から再分類して集計する。
   content_views_strict = is_ai_bot=0 かつ Google 系 bot UA でもなく、allowlist path のみ。 */
SELECT
  DATE(timestamp) AS day,
  COUNT(*) AS total,
  SUM(
    CASE
      WHEN is_ai_bot = 1
        OR LOWER(COALESCE(user_agent, '')) LIKE '%googlebot%'
        OR LOWER(COALESCE(user_agent, '')) LIKE '%google-inspectiontool%'
        OR LOWER(COALESCE(user_agent, '')) LIKE '%google-extended%'
      THEN 1 ELSE 0
    END
  ) AS ai_reclassified,
  SUM(
    CASE
      WHEN is_ai_bot = 0
        AND LOWER(COALESCE(user_agent, '')) NOT LIKE '%googlebot%'
        AND LOWER(COALESCE(user_agent, '')) NOT LIKE '%google-inspectiontool%'
        AND LOWER(COALESCE(user_agent, '')) NOT LIKE '%google-extended%'
        AND (
          url_path = '/'
          OR url_path LIKE '%.md'
          OR url_path LIKE '%.md?%'
          OR url_path LIKE '/llms%.txt'
          OR url_path LIKE '/llms%.txt?%'
        )
      THEN 1 ELSE 0
    END
  ) AS content_views_strict
FROM access_logs
WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
GROUP BY DATE(timestamp)
ORDER BY day DESC;
