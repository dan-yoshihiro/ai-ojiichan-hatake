/**
 * 管理者ログ表示エンドポイント
 *
 * URL: /admin/logs?token=<ADMIN_TOKEN>&view=<bot|recent|page>
 *
 * 認証は単純な token 比較（環境変数 ADMIN_TOKEN）。
 * 出力は plain text または JSON。CSS なし・semantic HTML すら最小。
 */

interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
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

  let sql = '';
  let label = '';

  switch (view) {
    case 'bot':
      // bot 別累計
      sql = `SELECT bot_name, access_count, unique_pages, first_seen, last_seen
             FROM bot_summary
             ORDER BY access_count DESC`;
      label = 'AI Bot Summary';
      break;
    case 'page':
      // URL 別 AI bot アクセス
      sql = `SELECT url_path, ai_access_count, unique_bots, bot_names
             FROM page_ai_views
             ORDER BY ai_access_count DESC
             LIMIT ?`;
      label = 'Page AI Views';
      break;
    case 'recent':
      // 直近のアクセス（AI bot のみ）
      sql = `SELECT timestamp, bot_name, url_path, country
             FROM access_logs
             WHERE is_ai_bot = 1
             ORDER BY timestamp DESC
             LIMIT ?`;
      label = 'Recent AI Bot Accesses';
      break;
    case 'human':
      // 直近の人間アクセス（AI bot 以外）
      sql = `SELECT timestamp, url_path, country, user_agent
             FROM access_logs
             WHERE is_ai_bot = 0
             ORDER BY timestamp DESC
             LIMIT ?`;
      label = 'Recent Human Accesses';
      break;
    case 'daily':
      // 日別集計
      sql = `SELECT DATE(timestamp) AS day,
                    COUNT(*) AS total,
                    SUM(is_ai_bot) AS ai_bots,
                    COUNT(*) - SUM(is_ai_bot) AS humans
             FROM access_logs
             GROUP BY DATE(timestamp)
             ORDER BY day DESC
             LIMIT ?`;
      label = 'Daily Summary';
      break;
    default:
      return new Response('view must be one of: bot, page, recent, human, daily', { status: 400 });
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
    `view=${view} count=${rows.length} limit=${limit}`,
    '',
    headers.join('\t'),
    ...rows.map(r => headers.map(h => String(r[h] ?? '')).join('\t')),
  ];

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
