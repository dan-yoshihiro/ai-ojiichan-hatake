/**
 * 管理者ログ表示エンドポイント
 *
 * URL: /admin/logs?token=<ADMIN_TOKEN>&view=<bot|recent|page|human|legit-human|daily>
 *
 * 認証は単純な token 比較（環境変数 ADMIN_TOKEN）。
 * 出力は plain text または JSON。CSS なし・semantic HTML すら最小。
 */

interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
}

const SCANNER_NOISE_SQL = `(
  url_path LIKE '%.env%'
  OR url_path LIKE '%.aws%'
  OR url_path LIKE '%.git%'
  OR url_path LIKE '%/credentials%'
  OR url_path LIKE '%/wp-%'
  OR url_path LIKE '%/wp/%'
  OR url_path LIKE '%/wordpress/%'
  OR url_path LIKE '%/blog/%'
  OR url_path LIKE '%xmlrpc.php%'
  OR url_path LIKE '//%'
  OR url_path LIKE '%.php%'
  OR url_path LIKE '%.asp%'
  OR url_path LIKE '%.aspx%'
  OR url_path LIKE '%.jsp%'
  OR url_path LIKE '%.cgi%'
  OR url_path LIKE '%.js%'
  OR url_path LIKE '%.css%'
  OR url_path LIKE '%.jsx%'
  OR url_path LIKE '%.tsx%'
  OR url_path LIKE '%.config%'
  OR url_path LIKE '%.conf%'
  OR url_path LIKE '%.ini%'
  OR url_path LIKE '%.yml%'
  OR url_path LIKE '%.yaml%'
  OR url_path LIKE '%/_environment%'
  OR url_path LIKE '/www/%'
  OR url_path LIKE '/uat/%'
  OR url_path LIKE '/tmp/%'
  OR url_path LIKE '/test/%'
  OR url_path LIKE '/staging/%'
  OR url_path LIKE '/webroot/%'
  OR url_path LIKE '/webmail/%'
  OR url_path LIKE '%/phpinfo%'
  OR url_path LIKE '%/info'
  OR url_path LIKE '%/info.%'
  OR url_path LIKE '%/info/%'
  OR url_path LIKE '%/info?%'
  OR url_path LIKE '%/_profiler/%'
  -- 2026-07-06 追加: 6/22-7/4 sweep で観測した secret 探査（middleware 第5弾拡張と対応）
  OR url_path LIKE '/graphql%'
  OR url_path = '/api'
  OR url_path LIKE '/api/%'
  OR url_path LIKE '/api?%'
  OR url_path LIKE '%.map'
  OR url_path LIKE '%.map?%'
  OR url_path LIKE '%.toml%'
  OR url_path LIKE '/env.%'
  OR url_path LIKE '%.dev.vars%'
  OR url_path LIKE '/package%'
  OR url_path LIKE '/wrangler%'
  OR url_path LIKE '/tsconfig%'
  OR url_path LIKE '/firebase.json%'
  OR url_path LIKE '/vercel.json%'
  OR url_path LIKE '/asset-manifest%'
  OR url_path LIKE '/manifest.json%'
  OR url_path LIKE '/composer.json%'
  OR url_path LIKE '/queries/%'
  OR url_path LIKE '/schema/%'
  -- 2026-07-07 第6弾: 単一 scanner 20種 sweep 対応
  OR url_path LIKE '%.mjs%'
  OR url_path LIKE '%.cjs%'
  OR url_path LIKE '/.npmrc%'
  OR url_path LIKE '/actuator%'
  OR url_path LIKE '/.well-known/apple-app-site%'
  OR url_path LIKE '/.well-known/assetlinks%'
  OR url_path LIKE '/.well-known/oauth-%'
  OR url_path LIKE '/.well-known/openid-%'
  OR url_path LIKE '/api-docs%'
  OR url_path LIKE '/asyncapi.json%'
  OR url_path LIKE '/postman.json%'
  OR url_path LIKE '/build-manifest.json%'
  OR url_path LIKE '/_payload.json%'
  OR url_path LIKE '/__manifest%'
  OR url_path LIKE '/_app/version.json%'
  OR url_path = '/query'
  OR url_path LIKE '/query?%'
  OR url_path LIKE '/__query%'
)`;

function daysAgoFilter(daysParam: string | null): string {
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 0, 1), 365) : 0;
  return days > 0 ? `timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${days} days')` : '1 = 1';
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 認証
  const token = url.searchParams.get('token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  const view = url.searchParams.get('view') || 'bot';
  const format = url.searchParams.get('format') || 'text';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 1000);
  const since = daysAgoFilter(url.searchParams.get('days'));

  let sql = '';
  let label = '';

  switch (view) {
    case 'bot':
      // bot 別集計。days 指定時も同じ条件で比較できるよう、view ではなく直接集計する。
      sql = `SELECT bot_name,
                    COUNT(*) AS access_count,
                    COUNT(DISTINCT url_path) AS unique_pages,
                    MIN(timestamp) AS first_seen,
                    MAX(timestamp) AS last_seen
             FROM access_logs
             WHERE is_ai_bot = 1 AND ${since}
             GROUP BY bot_name
             ORDER BY access_count DESC`;
      label = 'AI Bot Summary';
      break;
    case 'page':
      // URL 別 AI bot アクセス
      sql = `SELECT url_path,
                    COUNT(*) AS ai_access_count,
                    COUNT(DISTINCT bot_name) AS unique_bots,
                    GROUP_CONCAT(DISTINCT bot_name) AS bot_names
             FROM access_logs
             WHERE is_ai_bot = 1 AND ${since}
             GROUP BY url_path
             ORDER BY ai_access_count DESC
             LIMIT ?`;
      label = 'Page AI Views';
      break;
    case 'recent':
      // 直近のアクセス（AI bot のみ）
      sql = `SELECT timestamp, bot_name, url_path, country
             FROM access_logs
             WHERE is_ai_bot = 1 AND ${since}
             ORDER BY timestamp DESC
             LIMIT ?`;
      label = 'Recent AI Bot Accesses';
      break;
    case 'human':
      // 直近の人間アクセス（AI bot 以外）
      sql = `SELECT timestamp, url_path, country, user_agent
             FROM access_logs
             WHERE is_ai_bot = 0 AND ${since}
             ORDER BY timestamp DESC
             LIMIT ?`;
      label = 'Recent Human Accesses';
      break;
    case 'legit-human':
      // 直近の人間らしいアクセス（既知 scanner probe を除外）
      sql = `SELECT timestamp, url_path, country, user_agent
             FROM access_logs
             WHERE is_ai_bot = 0
               AND ${since}
               AND NOT ${SCANNER_NOISE_SQL}
             ORDER BY timestamp DESC
             LIMIT ?`;
      label = 'Recent Legit Human Accesses';
      break;
    case 'daily':
      // 日別集計
      sql = `SELECT DATE(timestamp) AS day,
                    COUNT(*) AS total,
                    COALESCE(SUM(is_ai_bot), 0) AS ai_bots,
                    SUM(CASE WHEN is_ai_bot = 0 THEN 1 ELSE 0 END) AS humans_or_scanners,
                    SUM(CASE WHEN is_ai_bot = 0 AND NOT ${SCANNER_NOISE_SQL} THEN 1 ELSE 0 END) AS legit_humans
             FROM access_logs
             WHERE ${since}
             GROUP BY DATE(timestamp)
             ORDER BY day DESC
             LIMIT ?`;
      label = 'Daily Summary';
      break;
    default:
      return new Response('view must be one of: bot, page, recent, human, legit-human, daily', { status: 400 });
  }

  let result;
  try {
    if (sql.includes('LIMIT ?')) {
      result = await env.LOGS_DB.prepare(sql).bind(limit).all();
    } else {
      result = await env.LOGS_DB.prepare(sql).all();
    }
  } catch (err: any) {
    return new Response(`Query error: ${err.message}`, { status: 500 });
  }

  const rows = result.results as Record<string, unknown>[];

  if (format === 'json') {
    return new Response(JSON.stringify({ label, view, count: rows.length, rows }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // plain text format（管理者向けに最小フォーマット）
  if (rows.length === 0) {
    return new Response(`# ${label}\n\n(no rows)\n`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    `# ${label}`,
    '',
    `view=${view} days=${url.searchParams.get('days') || 'all'} count=${rows.length} limit=${limit}`,
    '',
    headers.join('\t'),
    ...rows.map(r => headers.map(h => String(r[h] ?? '')).join('\t')),
  ];

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
