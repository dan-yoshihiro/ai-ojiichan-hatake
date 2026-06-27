/* AI bot 別累計を user_agent パターンで再分類して再集計する。
   2026-06-27: middleware の is_ai_bot 判定に Googlebot 系（Googlebot Desktop/Smartphone, Google-Extended, Google-InspectionTool）が漏れていた既知バグへの対処。
   既存 bot_name が NULL でも user_agent が Google 系パターンに match すれば再ラベルする。
   middleware 修正後の新規ログは bot_name が正しく付くため、本クエリは過去ログ含めた累計の再評価に使う。 */
SELECT
  bot,
  COUNT(*) AS hits,
  COUNT(DISTINCT url_path) AS pages,
  MIN(timestamp) AS first_seen,
  MAX(timestamp) AS last_seen
FROM (
  SELECT
    url_path,
    timestamp,
    CASE
      WHEN is_ai_bot = 1 THEN bot_name
      WHEN LOWER(COALESCE(user_agent, '')) LIKE '%google-extended%' THEN 'Google-Extended (reclassified)'
      WHEN LOWER(COALESCE(user_agent, '')) LIKE '%google-inspectiontool%' THEN 'Google-InspectionTool (reclassified)'
      WHEN LOWER(COALESCE(user_agent, '')) LIKE '%googlebot%' THEN 'Googlebot (reclassified)'
      ELSE NULL
    END AS bot
  FROM access_logs
)
WHERE bot IS NOT NULL
GROUP BY bot
ORDER BY hits DESC;
