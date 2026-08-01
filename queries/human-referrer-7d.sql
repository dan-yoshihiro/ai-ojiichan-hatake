/* 人間流入の referer 分類（7日）: AI検索 / 従来検索 / SNS / Direct / その他
 *
 * 目的: GEO サイトへの人間流入の中身を可視化する。
 * 現状 legit-human-7d.sql は url_path 別 hits のみで、referer を集計するクエリが存在しなかった。
 *
 * 除外:
 * - is_ai_bot = 1（AI bot）
 * - is_other_bot = 1（一般クローラー・CLI 等の機械アクセス。NULL は 0 扱い＝2026-07-06 以前の旧レコード）
 * - status_code != 200（NULL は許容＝旧レコード）
 * - allowlist 外のパス（scanner probe 除外）
 * - 自サイト内の遷移（内部リンククリックは referer が自ホストになるため category="internal" として分離）
 *
 * 分類の考え方（学び 7: 「AI は人間の行動シグナルを借りて評価」を実測するため、経路を分けて追う）:
 *  ai_search      = ChatGPT / Claude / Perplexity / Gemini / Copilot / You.com 等の AI 検索経由
 *  search         = 従来の Google / Bing / DuckDuckGo（AI Overview を含むが GA 側では分離できない）
 *  social         = X / t.co / note.com / Zenn / Qiita 等の被リンクからの流入
 *  direct         = referer NULL（ブックマーク・URL 直入力・アプリ内リンク・一部の HTTPS→HTTP 遷移）
 *  internal       = 自サイト（www.ai-ojiichan-hatake.pages.dev / 独自ドメイン）内の遷移
 *  other          = 上記どれにも該当しない外部 referer（発見のための箱）
 */

WITH filtered AS (
  SELECT
    referer,
    url_path,
    timestamp,
    -- referer から host を抽出。スキームなし・パス付き・NULL を扱う
    CASE
      WHEN referer IS NULL OR referer = '' THEN NULL
      ELSE LOWER(
        -- "https://foo.example.com/path" → "foo.example.com"
        SUBSTR(
          REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''),
          1,
          COALESCE(
            NULLIF(INSTR(REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''), '/'), 0) - 1,
            LENGTH(REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''))
          )
        )
      )
    END AS host
  FROM access_logs
  WHERE is_ai_bot = 0
    AND (is_other_bot IS NULL OR is_other_bot = 0)
    AND (status_code IS NULL OR status_code = 200)
    AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
    AND (
      url_path = '/'
      OR url_path LIKE '%.md'
      OR url_path LIKE '%.md?%'
      OR url_path LIKE '/llms%.txt'
      OR url_path LIKE '/llms%.txt?%'
    )
),
categorized AS (
  SELECT
    CASE
      WHEN host IS NULL THEN 'direct'
      WHEN host LIKE '%chatgpt.com' OR host LIKE '%chat.openai.com'
           OR host LIKE '%claude.ai'
           OR host LIKE '%perplexity.ai'
           OR host LIKE '%gemini.google.com'
           OR host LIKE '%copilot.microsoft.com' OR host LIKE '%bing.com/chat'
           OR host LIKE '%you.com'
           OR host LIKE '%phind.com'
           OR host LIKE '%kagi.com'
        THEN 'ai_search'
      WHEN host LIKE '%google.%' OR host LIKE '%bing.com' OR host LIKE '%duckduckgo.com'
           OR host LIKE '%yahoo.co.jp' OR host LIKE '%yandex.%'
        THEN 'search'
      WHEN host LIKE '%x.com' OR host = 't.co' OR host LIKE '%twitter.com'
           OR host LIKE '%note.com'
           OR host LIKE '%zenn.dev'
           OR host LIKE '%qiita.com'
           OR host LIKE '%hatena.ne.jp' OR host LIKE '%hatenablog.com'
           OR host LIKE '%facebook.com' OR host LIKE '%linkedin.com'
           OR host LIKE '%reddit.com'
        THEN 'social'
      WHEN host LIKE '%ai-ojiichan-hatake%' OR host LIKE '%pages.dev'
        THEN 'internal'
      ELSE 'other'
    END AS category,
    host,
    url_path,
    timestamp
  FROM filtered
)
SELECT
  category,
  COALESCE(host, '(no referer)') AS referrer_host,
  COUNT(*) AS hits,
  COUNT(DISTINCT url_path) AS unique_paths,
  MAX(timestamp) AS last_seen
FROM categorized
GROUP BY category, host
ORDER BY
  CASE category
    WHEN 'ai_search' THEN 1
    WHEN 'social' THEN 2
    WHEN 'search' THEN 3
    WHEN 'other' THEN 4
    WHEN 'direct' THEN 5
    WHEN 'internal' THEN 6
    ELSE 7
  END,
  hits DESC;
