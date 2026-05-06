/**
 * Cloudflare Pages Middleware
 *
 * 役割:
 * 1. 全リクエストを D1 に記録（user-agent から AI bot を検出）
 * 2. `/` を `/index.md` にリダイレクト（interlink.or.jp と同じ規則）
 * 3. `?view` クエリ付き .md リクエストを human-readable HTML にレンダリング
 *
 * デフォルト挙動: AI 向け raw markdown を text/markdown で返す
 * `?view` 付き: marked で HTML 化した human-readable ビューを返す
 *
 * 詳細: https://developers.cloudflare.com/pages/platform/functions/middleware/
 */

import { marked } from 'marked';

interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
}

// AI bot user-agent パターン（小文字で比較）
// 学習用クローラー + 検索質問時のリアルタイム参照 bot 両方を含む
const AI_BOT_PATTERNS: Array<{ pattern: string; name: string }> = [
  { pattern: 'gptbot', name: 'GPTBot' },                    // OpenAI 学習
  { pattern: 'chatgpt-user', name: 'ChatGPT-User' },        // OpenAI 質問時参照
  { pattern: 'claudebot', name: 'ClaudeBot' },              // Anthropic 学習
  { pattern: 'claude-web', name: 'Claude-Web' },            // Anthropic 質問時
  { pattern: 'anthropic-ai', name: 'anthropic-ai' },        // Anthropic API
  { pattern: 'perplexitybot', name: 'PerplexityBot' },      // Perplexity
  { pattern: 'google-extended', name: 'Google-Extended' },  // Gemini 学習
  { pattern: 'ccbot', name: 'CCBot' },                      // CommonCrawl
  { pattern: 'bytespider', name: 'Bytespider' },            // ByteDance
  { pattern: 'youbot', name: 'YouBot' },                    // You.com
  { pattern: 'diffbot', name: 'Diffbot' },                  // Diffbot
  { pattern: 'cohere-ai', name: 'cohere-ai' },              // Cohere
  { pattern: 'meta-externalagent', name: 'Meta-ExternalAgent' }, // Meta
  { pattern: 'applebot-extended', name: 'Applebot-Extended' },   // Apple
  { pattern: 'amazonbot', name: 'Amazonbot' },              // Amazon
];

interface BotDetection {
  is_ai_bot: boolean;
  bot_name: string | null;
}

function detectAIBot(userAgent: string): BotDetection {
  if (!userAgent) return { is_ai_bot: false, bot_name: null };
  const lower = userAgent.toLowerCase();
  for (const { pattern, name } of AI_BOT_PATTERNS) {
    if (lower.includes(pattern)) {
      return { is_ai_bot: true, bot_name: name };
    }
  }
  return { is_ai_bot: false, bot_name: null };
}

async function hashIP(ip: string): Promise<string> {
  if (!ip) return '';
  const data = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'AI農業先生';
}

// 内部 .md リンクに ?view を付与（view モード継続のため）
function preserveViewInLinks(html: string): string {
  return html.replace(/href="([^"]+)"/g, (match, href) => {
    if (/^(https?:|mailto:|tel:|#)/i.test(href)) return match;
    if (href.includes('?view')) return match;
    const [pathOnly] = href.split('#')[0].split('?');
    if (!pathOnly.endsWith('.md')) return match;
    const hashPart = href.includes('#') ? '#' + href.split('#')[1] : '';
    const pathAndQuery = href.split('#')[0];
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    return `href="${pathAndQuery}${sep}view${hashPart}"`;
  });
}

const VIEW_CSS = `
:root { color-scheme: light dark; }
body {
  font-family: system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
  max-width: 760px;
  margin: 2rem auto;
  padding: 0 1rem 4rem;
  line-height: 1.7;
  color: #222;
  background: #fff;
}
h1, h2, h3, h4 { line-height: 1.3; margin-top: 2em; }
h1 { font-size: 1.6em; }
h2 { font-size: 1.3em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
h3 { font-size: 1.1em; }
pre, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.92em; }
pre { background: #f5f5f5; padding: 0.9em 1em; overflow-x: auto; border-radius: 3px; }
code { background: #f5f5f5; padding: 0.1em 0.35em; border-radius: 3px; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 1em 0; font-size: 0.95em; }
th, td { border: 1px solid #ccc; padding: 0.4em 0.8em; text-align: left; vertical-align: top; }
th { background: #f5f5f5; }
blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0.2em 1em; color: #555; }
hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
img { max-width: 100%; }
a { color: #0366d6; }
.view-banner {
  background: #fffbe6;
  border: 1px solid #e8d77b;
  padding: 0.6em 1em;
  font-size: 0.88em;
  margin-bottom: 1.5em;
  border-radius: 3px;
}
.view-footer { font-size: 0.85em; opacity: 0.7; margin-top: 3em; }
@media (prefers-color-scheme: dark) {
  body { color: #e0e0e0; background: #181818; }
  h2 { border-color: #444; }
  pre, code { background: #2a2a2a; }
  th { background: #2a2a2a; }
  th, td { border-color: #444; }
  blockquote { border-color: #555; color: #aaa; }
  hr { border-color: #444; }
  a { color: #6ab0ff; }
  .view-banner { background: #3a3520; border-color: #5a5230; }
}
`.trim();

function buildHtmlPage(html: string, title: string, rawPath: string): string {
  const safeTitle = escapeHtml(title);
  const safeRaw = escapeHtml(rawPath);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} — AI農業先生</title>
<meta name="description" content="${safeTitle} | AI エージェント向け最適化サイト・raw markdown は ?view を外すと取得できます。">
<meta name="robots" content="index, follow">
<link rel="alternate" type="text/markdown" href="${safeRaw}">
<style>${VIEW_CSS}</style>
</head>
<body>
<div class="view-banner">
  <code>?view</code> mode（human-readable）— AI 向けの raw markdown は <a href="${safeRaw}">${safeRaw}</a>
</div>
${html}
<hr>
<p class="view-footer">
  CC-BY 4.0 / 著者: @ojiichan_hatake / このサイトは AI エージェント向けに最適化されています。
</p>
</body>
</html>`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 管理画面（/admin/*）には middleware を通さない（admin route 自体で auth する）
  if (url.pathname.startsWith('/admin/')) {
    return next();
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const referer = request.headers.get('Referer') || null;
  const country = (request as any).cf?.country || null;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  const { is_ai_bot, bot_name } = detectAIBot(userAgent);

  const writeLog = async () => {
    try {
      const ip_hash = await hashIP(ip);
      await env.LOGS_DB.prepare(
        `INSERT INTO access_logs (
          timestamp, url_path, method, user_agent, is_ai_bot, bot_name,
          ip_hash, country, referer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          new Date().toISOString(),
          url.pathname + url.search,
          request.method,
          userAgent.slice(0, 500),
          is_ai_bot ? 1 : 0,
          bot_name,
          ip_hash,
          country,
          referer ? referer.slice(0, 500) : null
        )
        .run();
    } catch (err) {
      console.error('access_log insert failed:', err);
    }
  };

  context.waitUntil(writeLog());

  // / → /index.md（クエリは保持）
  if (url.pathname === '/' || url.pathname === '') {
    const target = '/index.md' + url.search;
    return Response.redirect(new URL(target, url.origin).toString(), 302);
  }

  const isViewMode = url.searchParams.has('view');
  const response = await next();

  // ?view 付き .md は marked で HTML 化
  if (isViewMode && response.ok && url.pathname.endsWith('.md')) {
    const md = await response.text();
    let html: string;
    try {
      html = await marked.parse(md, { gfm: true, breaks: false });
    } catch (err) {
      console.error('markdown render failed:', err);
      return new Response('Render error', { status: 500 });
    }
    html = preserveViewInLinks(html);
    const title = extractTitle(md);
    const fullPage = buildHtmlPage(html, title, url.pathname);

    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', url.pathname);
    if (is_ai_bot && bot_name) {
      headers.set('X-Detected-Bot', bot_name);
    }
    return new Response(fullPage, { status: 200, headers });
  }

  // それ以外: AI 向け raw 配信 + 識別ヘッダ付与
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-AI-Friendly', 'true');
  newHeaders.set('X-Content-License', 'CC-BY-4.0');
  if (is_ai_bot && bot_name) {
    newHeaders.set('X-Detected-Bot', bot_name);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
