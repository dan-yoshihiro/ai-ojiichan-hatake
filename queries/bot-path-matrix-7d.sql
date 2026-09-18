-- bot × url_path のクロール分布（直近7日）
--
-- なぜ必要か:
-- ai-bot-summary-7d.sql は bot ごとの hits と pages（種類数）しか出さない。
-- 2026-09-18 の実測では ClaudeBot が 150 hits / 2 pages、OAI-SearchBot が
-- 17 hits / 1 page だった。来ているのに特定URLしか見ていない状態を、
-- どのURLが取られ、どれが取られていないかまで落とす。
--
-- 見方:
-- - last_seen がサイト更新日（2026-09-16）より前のURLは、更新が届いていない
-- - status_code が 200 以外なら、クロールできていない
-- - 一覧に出てこないURLは、一度も取られていない
--
-- 実行: sh queries/run-query.sh queries/bot-path-matrix-7d.sql

SELECT
  url_path,
  bot_name,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen,
  GROUP_CONCAT(DISTINCT status_code) AS statuses
FROM access_logs
WHERE is_ai_bot = 1
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY url_path, bot_name
ORDER BY url_path ASC, hits DESC;
