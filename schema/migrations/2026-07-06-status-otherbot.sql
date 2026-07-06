-- 2026-07-06: status_code + is_other_bot 追加
-- 背景: D1 ログ分析で (1) 200/404 の区別がつかず scanner 探査の成否も GEO 配信実績も検証不能、
-- (2) 「AI bot に該当しない = 人間」の二値判定で human_view が一般クローラーに汚染されていた
-- 適用: wrangler d1 execute ai-ojiichan-logs --remote --file=schema/migrations/2026-07-06-status-otherbot.sql
-- 注意: middleware の新 INSERT はこの2列を参照するため、デプロイ前に適用すること

ALTER TABLE access_logs ADD COLUMN status_code INTEGER;
ALTER TABLE access_logs ADD COLUMN is_other_bot INTEGER NOT NULL DEFAULT 0;
