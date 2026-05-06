-- Cloudflare D1 SQLite schema
-- 全アクセスログを記録する単一テーブル

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,           -- ISO 8601 (UTC)
  url_path TEXT NOT NULL,            -- /docs/learning-loop.md など
  method TEXT NOT NULL,              -- GET / HEAD / OPTIONS
  user_agent TEXT,                   -- 最大500字
  is_ai_bot INTEGER NOT NULL,        -- 0 or 1
  bot_name TEXT,                     -- GPTBot / ClaudeBot 等・人間なら NULL
  ip_hash TEXT,                      -- SHA-256 先頭16字（プライバシー保護）
  country TEXT,                      -- ISO国コード（Cloudflare 自動付与）
  referer TEXT                       -- 最大500字
);

CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp
  ON access_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_is_ai_bot
  ON access_logs(is_ai_bot, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_bot_name
  ON access_logs(bot_name, timestamp DESC) WHERE bot_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_logs_url_path
  ON access_logs(url_path, timestamp DESC);

-- 集計用ビュー: bot 別の累計アクセス数
CREATE VIEW IF NOT EXISTS bot_summary AS
SELECT
  bot_name,
  COUNT(*) AS access_count,
  COUNT(DISTINCT url_path) AS unique_pages,
  MIN(timestamp) AS first_seen,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 1
GROUP BY bot_name;

-- 集計用ビュー: URL 別のアクセス数（AI bot のみ）
CREATE VIEW IF NOT EXISTS page_ai_views AS
SELECT
  url_path,
  COUNT(*) AS ai_access_count,
  COUNT(DISTINCT bot_name) AS unique_bots,
  GROUP_CONCAT(DISTINCT bot_name) AS bot_names
FROM access_logs
WHERE is_ai_bot = 1
GROUP BY url_path;
