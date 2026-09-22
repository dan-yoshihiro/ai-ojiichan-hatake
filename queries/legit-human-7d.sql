/*
 * 人間候補のコンテンツ閲覧（直近7日）。
 * サーバーリクエストだけで「人間」は断定できないため、結果は人間候補として扱う。
 * AI bot / 一般 bot / 失敗応答 / scanner probe を除外し、実コンテンツの 200 応答だけを集計する。
 * unique_ip_candidates は同一ネットワーク（NAT）を一人にまとめることもあるため、人数ではない。
 *
 * 2026-09-22 変更: access_logs の is_other_bot 列ではなく access_logs_classified ビューを見る。
 * is_other_bot は書き込み時点の判定なので、ルールを直しても過去行に遡らない。
 * 実際この変更時点で、旧 human? 4,165 行のうち 1,475 行が現行ルールでは機械だった。
 *
 * 2026-09-22 変更: is_owner = 0 で運営者自身の閲覧を除外する。
 * 除外前は日本の人間候補 415 件のうち 404 件が運営者の4つの IP（プロバイダ割り当て変更で
 * 入れ替わった同一端末）で、外部読者は 11 件しかなかった。読者数を測る指標としては
 * 運営者を含めた数字に意味がない。運営者 IP の登録は schema/views.sql の owner_ips を参照。
 */
SELECT
  url_path,
  COUNT(*) AS human_candidate_pageviews,
  COUNT(DISTINCT ip_hash) AS unique_ip_candidates,
  MAX(timestamp) AS last_seen
FROM access_logs_classified
WHERE kind = 'human_candidate'
  AND is_owner = 0
  AND COALESCE(status_code, 200) = 200
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
  AND (
    url_path = '/'
    OR url_path LIKE '%.md'
    OR url_path LIKE '%.md?%'
    OR url_path LIKE '/llms%.txt'
    OR url_path LIKE '/llms%.txt?%'
  )
GROUP BY url_path
ORDER BY human_candidate_pageviews DESC;
