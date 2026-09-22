-- 2026-09-22: asn / as_organization / colo 追加
-- 背景: Cloudflare ダッシュボードは Pages 構成（Domains にゾーン0件）だと
-- Security Events が無く、国別の件数までしか辿れない。D1 側も country と
-- user_agent しか持っていなかったため、同一 UA が9カ国11IPに分散する scanner 群を
-- 「住宅プロキシ網か、データセンター事業者か」で切り分けられなかった。
-- asn / as_organization は UA 偽装の影響を受けないので、bot 判定の裏取りに使える。
-- 適用: wrangler d1 execute ai-ojiichan-logs --remote --file=schema/migrations/2026-09-22-asn.sql
-- 注意: middleware の新 INSERT はこの3列を参照するため、デプロイ前に適用すること

ALTER TABLE access_logs ADD COLUMN asn INTEGER;
ALTER TABLE access_logs ADD COLUMN as_organization TEXT;
ALTER TABLE access_logs ADD COLUMN colo TEXT;

CREATE INDEX IF NOT EXISTS idx_access_logs_asn
  ON access_logs(asn, timestamp DESC);
