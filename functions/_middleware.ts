/**
 * Cloudflare Pages Middleware
 *
 * 役割:
 * 1. 全リクエストを D1 に記録（user-agent から AI bot を検出）
 * 2. `/` を `/index.md` の content で HTML 配信（2026-05-21 変更: 302 redirect を廃止）
 * 3. `?view` クエリ付き .md リクエストを human-readable HTML にレンダリング
 *
 * デフォルト挙動: AI 向け raw markdown を text/markdown で返す（/index.md 等への直接アクセス）
 * `/` および `?view` 付き: marked で HTML 化した human-readable ビュー + 構造化データを返す
 *
 * 詳細: https://developers.cloudflare.com/pages/platform/functions/middleware/
 */

import { marked } from 'marked';

interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
  ASSETS: Fetcher;
}

// AI bot user-agent パターン（小文字で比較）
// 学習用クローラー + 検索質問時のリアルタイム参照 bot 両方を含む
const AI_BOT_PATTERNS: Array<{ pattern: string; name: string }> = [
  // OpenAI（3経路: 学習・検索・ユーザー指示型）
  { pattern: 'gptbot', name: 'GPTBot' },                    // OpenAI 学習
  { pattern: 'oai-searchbot', name: 'OAI-SearchBot' },      // OpenAI 検索インデックス
  { pattern: 'chatgpt-user', name: 'ChatGPT-User' },        // OpenAI ユーザー指示型 URL 取得
  // Anthropic（3経路: 学習・検索・ユーザー指示型）
  { pattern: 'claudebot', name: 'ClaudeBot' },              // Anthropic 学習
  { pattern: 'claude-searchbot', name: 'Claude-SearchBot' },// Anthropic 検索インデックス
  { pattern: 'claude-user', name: 'Claude-User' },          // Anthropic ユーザー指示型 URL 取得
  // Google（4経路: AI 学習・検索 index Desktop/Smartphone・GSC 検査）
  // 順序: google-extended と google-inspectiontool を googlebot より先に置いて誤判定を防ぐ
  { pattern: 'google-extended', name: 'Google-Extended' },  // Gemini 学習
  { pattern: 'google-inspectiontool', name: 'Google-InspectionTool' }, // GSC URL 検査ツール
  { pattern: 'googlebot', name: 'Googlebot' },              // Google 検索 index（Desktop/Smartphone 両方マッチ・AI Overview の参照源）
  // Microsoft/Bing（検索 index + Copilot の参照源）
  // 2026-07-07 追加: IndexNow 送信後、7/6 に Bingbot 訪問を確認したが is_ai_bot=0 で記録されていた
  { pattern: 'bingbot', name: 'Bingbot' },                  // Bing 検索 index + Microsoft Copilot 参照源
  // その他主要 AI bot
  { pattern: 'perplexitybot', name: 'PerplexityBot' },      // Perplexity
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

// 2026-07-06 追加: AI bot 一覧に該当しない機械アクセス（一般クローラー・CLI・headless browser）の判定
// 目的: human_view 集計の汚染防止。7/4 の「human 50 view」が全ページ均一 15-18 hit の
// 一括クロール形で、人間閲覧と区別できなかった反省から。ここに該当しない UA のみ「人間」とみなす
const OTHER_BOT_UA_REGEX =
  /bot|crawler|spider|slurp|scrapy|curl|wget|python|go-http-client|httpx|aiohttp|okhttp|libwww|java\/|node-fetch|axios|headless|phantomjs|selenium|playwright|puppeteer|facebookexternalhit/i;

function detectOtherBot(userAgent: string): boolean {
  if (!userAgent) return true; // UA 空は正規ブラウザではあり得ない → 機械アクセス扱い
  if (OTHER_BOT_UA_REGEX.test(userAgent)) return true;
  // 2026-07-07 追加: UA 完全性チェック。Mozilla を名乗るなら本物ブラウザには必ず
  // Chrome/Firefox/Safari/Edg/OPR/Trident のバージョンタグが含まれる。
  // 抜けているものは偽装 UA（scanner の常套手段）。
  // 事例: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" が / を
  // 定期 poll しつつ referer null で ZA から 11 回。本物 Chrome なら末尾に Chrome/x + Safari/x が付く
  if (userAgent.startsWith('Mozilla/') && !/(Chrome|Firefox|Safari\/[\d.]+|Edg|OPR|Trident|Version\/[\d.]+)/i.test(userAgent)) {
    return true;
  }
  return false;
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

function isScannerNoisePath(pathname: string): boolean {
  return /\.(env|aws|git)/i.test(pathname)
    || pathname.includes('/credentials')
    || /\/wp[-/]/i.test(pathname)              // /wp-json /wp-admin /wp/ 等
    || /\/(wordpress|blog)\//i.test(pathname)  // /wordpress/ /blog/
    || pathname.includes('xmlrpc.php')         // WordPress XML-RPC
    || pathname.startsWith('//')               // // で始まる二重スラッシュ系
    // 2026-05-09 拡張: 5/6-5/8 D1 ログ観察で全425アクセス中 ~370 が scanner と判明
    // 本サイトは Markdown + xml + txt のみで .php/.js/.css ファイルは不在のため
    // これらの拡張子を持つパスは全て scanner probe と断定して安全
    || /\.(php|asp|aspx|jsp|cgi)($|\?|\/)/i.test(pathname)    // PHP/ASP/JSP系
    || /\.(js|css|jsx|tsx)($|\?)/i.test(pathname)             // JS/CSS系
    || /\.(config|conf|ini|yml|yaml)($|\?)/i.test(pathname)   // 設定ファイル probe（/web.config 等）
    || /\/_environment/i.test(pathname)                        // dev 環境変数 probe
    || /^\/(www|uat|tmp|test|staging|webroot|webmail)\//i.test(pathname)  // dev 環境名
    // 2026-05-12 第4弾拡張: 5/11 D1 ログで scanner が backup ファイル探索パターンに適応
    // 新パターン8種類（/phpinfo.php~, /phpinfo.php.bak, /phpinfo, /info, /_profiler/phpinfo 等）
    || /\/phpinfo/i.test(pathname)                            // /phpinfo 単体 + 全 backup suffix（~/.bak/.old/.save等）一網打尽
    || /\/info(\.|$|\/|\?)/i.test(pathname)                  // /info, /info.* （/information.md 等は誤爆なし）
    || /\/_profiler\//i.test(pathname)                        // Symfony framework profiler 探索
    || /\.(php|asp|aspx|jsp|cgi)\.(bak|old|save|orig)($|\?)/i.test(pathname)  // .php.bak 系 backup
    || /\.(php|asp|aspx|jsp|cgi)~($|\?)/i.test(pathname)      // .php~ 系（vi/エディタ backup）
    // 2026-07-06 第5弾拡張: 6/22・6/28・7/4 の secret 探査 sweep（/graphql, source map, 設定ファイル）対応
    // pages_build_output_dir="." のため package.json / wrangler.toml / queries/ / schema/ が
    // 静的アセットとして実在・配信されていた（curl で 200 確認済み）。ここで 404 に落とす
    || /^\/(graphql|api)(\/|$|\?)/i.test(pathname)            // GraphQL/API endpoint 探査（本サイトに API は無い）
    || /\.map($|\?)/i.test(pathname)                          // source map 探査（/worker.js.map 等）
    || /\.(ts|toml)($|\?)/i.test(pathname)                    // TS ソース・TOML 探査（/vite.config.ts 等。本サイトは .md/.txt/.xml のみ配信）
    || /\/\.dev\.vars/i.test(pathname)                        // wrangler ローカル秘密ファイル探査
    || /^\/env\./i.test(pathname)                             // /env.production 等（dot 無し env 系）
    || /^\/(package(-lock)?\.json|wrangler\.toml|tsconfig\.json|firebase\.json|vercel\.json|asset-manifest\.json|manifest\.json|composer\.json)($|\?)/i.test(pathname)  // 設定ファイル（deploy root 実在分を含む）
    || /^\/(queries|schema)\//i.test(pathname)                // 分析 SQL・DB schema（公開意図なし）
    // 2026-07-07 第6弾拡張: 7/6 23:26-23:42 の単一 scanner 一括 sweep（20種）を fingerprint
    // 全て 404 だったが D1 記録量削減のため middleware で早期弾き
    || /\.(mjs|cjs)($|\?)/i.test(pathname)                    // vite.config.mjs / next.config.cjs 等
    || /^\/\.npmrc/i.test(pathname)                           // npm registry credential 探査
    || /^\/actuator(\/|$|\?)/i.test(pathname)                 // Spring Boot Actuator（/actuator/env, /actuator/health 等）
    || /^\/\.well-known\/(apple-app-site-association|assetlinks\.json|oauth-authorization-server|openid-configuration)/i.test(pathname)  // モバイルアプリ検証・OAuth/OIDC 探査
    || /^\/(api-docs|asyncapi\.json|postman\.json|build-manifest\.json|_payload\.json|__manifest|_app\/version\.json)($|\?)/i.test(pathname)  // SPA/API doc 探査
    || /^\/(query|__query)($|\?)/i.test(pathname);            // GraphQL 単体 endpoint 探査
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

function extractDescription(md: string): string {
  // TL;DR ブロックを優先抽出（GEO 最適化）
  const tldrMatch = md.match(/>\s*\*\*TL;DR\*\*[：:]\s*([^\n]+(?:\n>[^\n]+)*)/);
  if (tldrMatch) {
    return tldrMatch[1].replace(/\n>\s*/g, ' ').replace(/\*\*/g, '').slice(0, 300);
  }
  // フォールバック: 最初の段落
  const lines = md.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>')) {
      return trimmed.slice(0, 200);
    }
  }
  return 'AI エージェント向け最適化ドキュメント';
}

function buildJsonLd(title: string, description: string, rawPath: string, canonicalUrl: string): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description: description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: '2026-05-06',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    inLanguage: 'ja',
    isAccessibleForFree: true,
    author: {
      '@type': 'Person',
      name: '@ojiichan_hatake',
      url: 'https://x.com/ojiichan_hatake',
    },
    publisher: {
      '@type': 'Person',
      name: '@ojiichan_hatake',
      url: 'https://x.com/ojiichan_hatake',
    },
    encoding: {
      '@type': 'MediaObject',
      contentUrl: rawPath,
      encodingFormat: 'text/markdown',
    },
    keywords: '個人 SNS マーケ実験, AI ペルソナ運用, llms.txt 実装事例, AI bot detection, GEO optimization',
  };
  return JSON.stringify(ld);
}

function buildHtmlPage(html: string, title: string, rawPath: string, markdown: string): string {
  const safeTitle = escapeHtml(title);
  const safeRaw = escapeHtml(rawPath);
  const description = extractDescription(markdown);
  const safeDescription = escapeHtml(description);
  const canonicalUrl = `https://ai-ojiichan-system.pages.dev${rawPath}`;
  const jsonLd = buildJsonLd(title, description, rawPath, canonicalUrl);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} — AI農業先生方式</title>
<meta name="description" content="${safeDescription}">
<meta name="robots" content="index, follow">
<meta name="google-site-verification" content="fuTMLD_lGpfrl7HahiI0rqBBzo2B6rnSm6qQ5njg3TE">
<meta name="keywords" content="個人 SNS マーケ実験, AI ペルソナ運用, llms.txt 実装事例, AI bot detection, GEO optimization, AI農業先生方式">
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle} — AI農業先生方式">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:site_name" content="AI農業先生方式">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<meta name="twitter:creator" content="@ojiichan_hatake">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<link rel="alternate" type="text/markdown" href="${safeRaw}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<script type="application/ld+json">${jsonLd}</script>
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

  // Scanner noise: skip logging probes for common secret/config paths.
  if (isScannerNoisePath(url.pathname)) {
    return new Response('Not Found', { status: 404 });
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const referer = request.headers.get('Referer') || null;
  const country = (request as any).cf?.country || null;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  const { is_ai_bot, bot_name } = detectAIBot(userAgent);
  const is_other_bot = !is_ai_bot && detectOtherBot(userAgent);

  // 2026-07-06 変更: response 確定後に status_code 込みで記録する方式に
  // （従来は request 受信時に記録 → 200/404 の区別がつかず、scanner 探査の成否も
  //   GEO 分析（content が実際に配信されたか）も検証できなかった）
  const logRequest = (status: number) => {
    context.waitUntil((async () => {
      try {
        const ip_hash = await hashIP(ip);
        await env.LOGS_DB.prepare(
          `INSERT INTO access_logs (
            timestamp, url_path, method, user_agent, is_ai_bot, bot_name,
            ip_hash, country, referer, status_code, is_other_bot
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            referer ? referer.slice(0, 500) : null,
            status,
            is_other_bot ? 1 : 0
          )
          .run();
      } catch (err) {
        console.error('access_log insert failed:', err);
      }
    })());
  };

  // /.well-known/security.txt（RFC 9116）: 2026-07-06 設置
  // scanner が23回探査していた。実物を返して 404 ノイズを止め、脆弱性報告の窓口も明示する
  if (url.pathname === '/.well-known/security.txt') {
    const body = [
      'Contact: mailto:marketing@rockhearts.co.jp',
      'Expires: 2027-07-06T00:00:00.000Z',
      'Preferred-Languages: ja, en',
      'Canonical: https://ai-ojiichan-system.pages.dev/.well-known/security.txt',
    ].join('\n') + '\n';
    logRequest(200);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // / → /index.md の content を HTML で直接配信
  // 2026-05-21 変更: 302 redirect を廃止し 200 OK + HTML 配信に。理由:
  //  - Googlebot が `/` を fetch した時に直接 HTML を index 可能（GSC verification 含む）
  //  - 302 redirect → /index.md (raw markdown) では Google が「中身のないリダイレクト」と判定するリスク
  // AI bot が raw markdown を取りたい場合は /index.md を直接 fetch する設計を維持
  if (url.pathname === '/' || url.pathname === '') {
    const indexUrl = new URL('/index.md', url.origin);
    const assetResponse = await env.ASSETS.fetch(indexUrl.toString());
    if (!assetResponse.ok) {
      logRequest(404);
      return new Response('Index not found', { status: 404 });
    }
    const md = await assetResponse.text();
    let html: string;
    try {
      html = await marked.parse(md, { gfm: true, breaks: false });
    } catch (err) {
      console.error('homepage render failed:', err);
      logRequest(500);
      return new Response('Render error', { status: 500 });
    }
    html = preserveViewInLinks(html);
    const title = extractTitle(md);
    const fullPage = buildHtmlPage(html, title, '/index.md', md);

    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', '/index.md');
    if (is_ai_bot && bot_name) {
      headers.set('X-Detected-Bot', bot_name);
    }
    logRequest(200);
    return new Response(fullPage, { status: 200, headers });
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
      logRequest(500);
      return new Response('Render error', { status: 500 });
    }
    html = preserveViewInLinks(html);
    const title = extractTitle(md);
    const fullPage = buildHtmlPage(html, title, url.pathname, md);

    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', url.pathname);
    if (is_ai_bot && bot_name) {
      headers.set('X-Detected-Bot', bot_name);
    }
    logRequest(200);
    return new Response(fullPage, { status: 200, headers });
  }

  // それ以外: AI 向け raw 配信 + 識別ヘッダ付与
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-AI-Friendly', 'true');
  newHeaders.set('X-Content-License', 'CC-BY-4.0');
  if (is_ai_bot && bot_name) {
    newHeaders.set('X-Detected-Bot', bot_name);
  }

  logRequest(response.status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
