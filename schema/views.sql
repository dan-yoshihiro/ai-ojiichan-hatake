-- access_logs_classified: 機械/人間の境界をクエリ時に再判定するビュー（2026-09-22 追加）
--
-- このファイルは冪等（DROP してから作り直す）なので、新規 DB でも既存 DB でも
-- そのまま流せる。判定ルールを直したら再実行するだけで過去分にも効く。
-- 定義を init.sql と migrations に二重に置くとルールがズレるため、ここが唯一の置き場所。
-- 適用: npm run d1:views
--
-- 背景:
-- is_other_bot は「書き込み時点の middleware が何と判断したか」の記録で、
-- 判定ルールを直しても過去行には遡らない。2026-09-22 時点で human? 4,165 行のうち
-- 1,475 行（35%）が現行ルールでは機械だった。内訳は 7/6 以前が 2,654 行中 1,368 行（52%）、
-- 7/6 以降が 1,511 行中 107 行。7/6 以前は is_other_bot 列そのものが無かった時代のため汚染が濃い。
--
-- なぜ UPDATE ではなくビューか:
-- (1) 2026-06-27 の Googlebot 判定漏れでも過去ログは書き換えず
--     queries/ai-bot-summary-reclassified.sql で再集計する方針を採った。その踏襲。
-- (2) is_other_bot を上書きすると、数字が動いた理由が「ルールを変えたから」なのか
--     「アクセス傾向が変わったから」なのか後から区別できなくなる。
-- (3) 判定ルールは今後も変わる（7/7、9/22 と既に2回）。ビューなら次の変更も過去に自動で効く。
--
-- 判定ルールの同期について:
-- 下の CASE は functions/_middleware.ts の detectOtherBot() と同じ規則を SQL で書いたもの。
-- 片方だけ直すとズレるため、どちらかを変えたら必ず両方を直すこと。
-- 大文字小文字の扱いも合わせてある:
--   - 語彙マッチと browser token は TS 側が /i なので LOWER() + LIKE（LIKE は既定で大小無視）
--   - Mozilla/ 前方一致は TS 側が startsWith() で大小区別するため GLOB（GLOB は大小区別する）
--

DROP VIEW IF EXISTS access_logs_classified;

CREATE VIEW access_logs_classified AS
SELECT
  *,
  CASE
    WHEN is_ai_bot = 1 THEN 'ai_bot'
    -- 書き込み時点で機械と判定済みの行は、再判定で覆さない（判定は緩めない）
    WHEN COALESCE(is_other_bot, 0) = 1 THEN 'other_bot'
    -- 以下は detectOtherBot() の再現
    WHEN COALESCE(user_agent, '') = '' THEN 'other_bot'
    WHEN LOWER(user_agent) LIKE '%bot%'
      OR LOWER(user_agent) LIKE '%crawler%'
      OR LOWER(user_agent) LIKE '%spider%'
      OR LOWER(user_agent) LIKE '%slurp%'
      OR LOWER(user_agent) LIKE '%scrapy%'
      OR LOWER(user_agent) LIKE '%curl%'
      OR LOWER(user_agent) LIKE '%wget%'
      OR LOWER(user_agent) LIKE '%python%'
      OR LOWER(user_agent) LIKE '%go-http-client%'
      OR LOWER(user_agent) LIKE '%httpx%'
      OR LOWER(user_agent) LIKE '%aiohttp%'
      OR LOWER(user_agent) LIKE '%okhttp%'
      OR LOWER(user_agent) LIKE '%libwww%'
      OR LOWER(user_agent) LIKE '%java/%'
      OR LOWER(user_agent) LIKE '%node-fetch%'
      OR LOWER(user_agent) LIKE '%axios%'
      OR LOWER(user_agent) LIKE '%headless%'
      OR LOWER(user_agent) LIKE '%phantomjs%'
      OR LOWER(user_agent) LIKE '%selenium%'
      OR LOWER(user_agent) LIKE '%playwright%'
      OR LOWER(user_agent) LIKE '%puppeteer%'
      OR LOWER(user_agent) LIKE '%facebookexternalhit%'
      THEN 'other_bot'
    -- Mozilla/ で始まらない UA は正規ブラウザではない
    WHEN user_agent NOT GLOB 'Mozilla/*' THEN 'other_bot'
    -- Mozilla を名乗るのに browser token が無い UA は偽装
    WHEN LOWER(user_agent) NOT LIKE '%chrome%'
      AND LOWER(user_agent) NOT LIKE '%firefox%'
      AND LOWER(user_agent) NOT LIKE '%safari/%'
      AND LOWER(user_agent) NOT LIKE '%edg%'
      AND LOWER(user_agent) NOT LIKE '%opr%'
      AND LOWER(user_agent) NOT LIKE '%trident%'
      AND LOWER(user_agent) NOT LIKE '%version/%'
      THEN 'other_bot'
    ELSE 'human_candidate'
  END AS kind
FROM access_logs;
