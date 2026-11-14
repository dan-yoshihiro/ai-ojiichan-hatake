/* 入口別の流入（30日）: どこに貼ったリンクから人が来たか
 * 経緯は ai_memo 参照: 2026-11-14-ojiichan-site-inflow
 *
 * 2026-11-14 追加。X のアプリ内ブラウザや note のアプリからの遷移は referer が付かないことが多く、
 * human-referrer-7d.sql では direct に混ざって区別できない。60日分を数え直したとき、
 * X（t.co）からの流入は 0 件、外部 referer 付きの流入も十数件しかなかった。
 * そこで、外に貼るリンクには ?utm_source=... を付け、その値で入口を数える。
 *
 * 貼るリンクの付け方（utm_source の値はこの表と揃える）:
 *   note のプロフィール … ?utm_source=note_profile
 *   note の記事本文     … ?utm_source=note_article
 *   Zenn の記事         … ?utm_source=zenn
 *   Zenn のプロフィール … ?utm_source=zenn_profile
 *   Qiita の記事        … ?utm_source=qiita
 *   Qiita のプロフィール … ?utm_source=qiita_profile
 *
 * X（@ojiichan_hatake）には貼らない。フォロワーは家庭菜園が好きな人が中心で、
 * AI を嫌う人もいる。サイトはAI運用の記録なので、X から誘うとアカウントの読者を遠ざける。
 * サイトの入口は note（AIとX運用の記事を書いている）・Zenn・Qiita と検索に置く（Zenn と Qiita は 2026-11-14 追加）。
 *
 * utm_source が無い行は referer の host で補う（無ければ direct）。
 * 除外は human-referrer-7d.sql と同じ: AI bot・一般 bot・運営者・200 以外・admin と静的ファイル。
 */
WITH base AS (
  SELECT
    url_path,
    ip_hash,
    timestamp,
    CASE
      WHEN INSTR(url_path, 'utm_source=') > 0 THEN
        SUBSTR(
          SUBSTR(url_path, INSTR(url_path, 'utm_source=') + 11),
          1,
          COALESCE(
            NULLIF(INSTR(SUBSTR(url_path, INSTR(url_path, 'utm_source=') + 11), '&'), 0) - 1,
            LENGTH(url_path)
          )
        )
      ELSE NULL
    END AS utm_source,
    CASE
      WHEN referer IS NULL OR referer = '' THEN NULL
      ELSE LOWER(
        SUBSTR(
          REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''),
          1,
          COALESCE(
            NULLIF(INSTR(REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''), '/'), 0) - 1,
            LENGTH(REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''))
          )
        )
      )
    END AS ref_host
  FROM access_logs_classified
  WHERE kind = 'human_candidate'
    AND is_owner = 0
    AND COALESCE(status_code, 200) = 200
    AND url_path NOT LIKE '/static/%'
    AND url_path NOT LIKE '/admin%'
    AND url_path NOT LIKE '%.txt%'
    AND url_path NOT LIKE '%.xml%'
    AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
)
SELECT
  CASE
    WHEN utm_source IS NOT NULL THEN 'utm:' || utm_source
    WHEN ref_host IS NULL THEN 'direct'
    WHEN ref_host LIKE '%ai-ojiichan-system.pages.dev' THEN 'internal'
    ELSE 'ref:' || ref_host
  END AS source,
  COUNT(*) AS pageviews,
  COUNT(DISTINCT ip_hash) AS ip_candidates,
  MAX(timestamp) AS last_seen
FROM base
GROUP BY source
ORDER BY
  CASE WHEN source LIKE 'utm:%' THEN 1 WHEN source LIKE 'ref:%' THEN 2 WHEN source = 'direct' THEN 3 ELSE 4 END,
  pageviews DESC;
