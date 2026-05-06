/**
 * 管理画面 index — token 認証 + 利用可能なエンドポイント案内
 */

interface Env {
  ADMIN_TOKEN?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = `# Admin

Available views:

- /admin/logs?token=...&view=bot           — AI bot 別累計
- /admin/logs?token=...&view=page          — URL 別 AI アクセス
- /admin/logs?token=...&view=recent        — 直近 AI bot アクセス
- /admin/logs?token=...&view=human         — 直近 human アクセス
- /admin/logs?token=...&view=daily         — 日別集計

Optional params:
- limit=N     (default 50, max 1000)
- format=json (default: text/plain)
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
