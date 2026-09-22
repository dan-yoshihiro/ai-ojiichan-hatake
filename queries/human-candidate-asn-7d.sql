/* human? 候補を ASN で裏取りする（7日）
 *
 * 目的: bot 判定を通り抜けた「人間かもしれない」アクセスの素性を、UA ではなく
 * 接続元ネットワークで確かめる。UA は自己申告なので偽装できるが、ASN はできない。
 *
 * 発端（2026-09-22）: 直近7日の human? 158 hit のうち 133 hit が
 * わずか3種類の汎用デスクトップ UA に集中し、最多の Mac Chrome UA は
 * 9カ国11IPにまたがっていた。同一 UA 文字列が9カ国から来るのは
 * 住宅プロキシ網か scanner の分散実行で、UA だけでは判別できなかった。
 *
 * 見方:
 *  as_org がデータセンター事業者（Amazon / Google Cloud / DigitalOcean /
 *  Hetzner / OVH / Linode / Alibaba / Tencent 等）→ 機械アクセス。
 *  as_org が住宅 ISP（NTT / KDDI / Comcast / Deutsche Telekom 等）→ 人間の可能性。
 *  ただし住宅プロキシ網は住宅 ISP の ASN を使うため、countries が多い行は
 *  as_org が住宅 ISP でも機械を疑う。
 *
 * 注意:
 *  - asn / as_organization は 2026-09-22 のデプロイ以降のレコードにのみ入る。
 *    それ以前は NULL なので (no data) 行に集まる。
 */

SELECT
  COALESCE(as_organization, '(no data)') AS as_org,
  COALESCE(CAST(asn AS TEXT), '-') AS asn,
  COUNT(*) AS hits,
  COUNT(DISTINCT country) AS countries,
  COUNT(DISTINCT ip_hash) AS ips,
  COUNT(DISTINCT url_path) AS paths,
  SUM(CASE WHEN referer IS NULL THEN 1 ELSE 0 END) AS no_referer,
  GROUP_CONCAT(DISTINCT country) AS country_list,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 0
  AND COALESCE(is_other_bot, 0) = 0
  AND (status_code IS NULL OR status_code = 200)
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY as_org, asn
ORDER BY hits DESC;
