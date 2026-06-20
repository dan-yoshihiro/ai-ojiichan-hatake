-- 実コンテンツ閲覧のみを数える allowlist 方式
-- 理由: スキャナーは数百種の probe path（/env.* /actuator/* /gql /netlify.toml 等）を打つため、
--       denylist では追いつかない（whack-a-mole）。対象を正規コンテンツに限定する方が robust。
-- 対象: ルート / *.md / *.md?view / llms*.txt のみ（is_ai_bot=0）
SELECT
  url_path,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 0
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
  AND (
    url_path = '/'
    OR url_path LIKE '%.md'
    OR url_path LIKE '%.md?%'
    OR url_path LIKE '/llms%.txt'
    OR url_path LIKE '/llms%.txt?%'
  )
GROUP BY url_path
ORDER BY hits DESC;
