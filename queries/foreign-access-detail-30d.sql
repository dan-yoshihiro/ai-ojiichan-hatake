/* 日本以外からのアクセス明細（30日）: 国 × UA × パス を1行ずつ出す
 *
 * 目的: Cloudflare の Account analytics「Requests by country」で見えるのは
 * 国と件数だけで、その先（どのUA・どのパス・bot か人間か）が辿れない。
 * D1 の access_logs には country / user_agent / referer / status_code が
 * 既に入っているので、国別の内訳はダッシュボードを使わずここで確定できる。
 *
 * 見方:
 *  kind = ai_bot      … detectAIBot() が UA から判定した AI クローラー
 *  kind = other_bot   … 一般クローラー・CLI 等の機械アクセス
 *  kind = human?      … 上記どちらでもない。実ブラウザの可能性があるが、
 *                       UA 偽装のボットもここに落ちるため referer と ip_hash の
 *                       重複を併せて見る（単発 + referer NULL は機械を疑う）
 *
 * 注意:
 *  - country は Cloudflare が付与する接続元の国。VPN / プロキシ経由だと出口国になる。
 *  - _routes.json の include 外（/static/* 等）は Functions を通らないので記録されない。
 *  - is_other_bot の NULL は 2026-07-06 以前の旧レコード（0 扱い）。
 *  - asn / as_org は 2026-09-22 のデプロイ以降のレコードにしか入らない（旧分は '-'）。
 *
 * 特定の国だけ見たいときは WHERE に country = 'BE' を足す。
 */

SELECT
  country,
  timestamp,
  CASE
    WHEN is_ai_bot = 1 THEN 'ai_bot'
    WHEN COALESCE(is_other_bot, 0) = 1 THEN 'other_bot'
    ELSE 'human?'
  END AS kind,
  COALESCE(bot_name, '-') AS bot_name,
  method,
  status_code,
  url_path,
  COALESCE(referer, '(no referer)') AS referer,
  COALESCE(CAST(asn AS TEXT), '-') AS asn,
  COALESCE(as_organization, '-') AS as_org,
  ip_hash,
  user_agent
FROM access_logs
WHERE COALESCE(country, 'XX') <> 'JP'
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
ORDER BY timestamp DESC
LIMIT 200;
