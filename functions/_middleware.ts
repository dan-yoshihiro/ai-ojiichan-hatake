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

const PRODUCTION_PAGES_HOSTNAME = 'ai-ojiichan-system.pages.dev';

/**
 * `_headers` は Pages Functions が生成したレスポンスには適用されないため、
 * 本番 pages.dev ホストでは Functions 側でも index 許可を明示する。
 * ハッシュ・ブランチ付きのプレビューホストには付与しない。
 */
function setProductionRobotsHeader(headers: Headers, url: URL): void {
  if (url.hostname === PRODUCTION_PAGES_HOSTNAME) {
    headers.set('X-Robots-Tag', 'index, follow');
  }
}

interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
  /** Cloudflare Web Analytics の JS snippet に表示される site token */
  CF_WEB_ANALYTICS_TOKEN?: string;
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

// 2026-08-13: サイトを「SNSの週次振り返り」へ絞り込んだ際に削除した記事の移転先。
// 検索結果・外部リンクの評価を引き継ぎ、閲覧者を最も近い現行コンテンツへ案内する。
const LEGACY_REDIRECTS: Record<string, string> = {
  '/docs/craft-axes.md': '/x-impressions-drop',
  '/docs/failed-experiments.md': '/x-impressions-drop',
  '/docs/reply-activity-drives-growth.md': '/x-impressions-drop',
  '/docs/x-algorithm-reverse-engineered.md': '/x-impressions-drop',
  // 2026-10-02: 同じ問いに答える記事が並んでいたため、投稿分析の記事を
  // インプレッション低下の記事へ統合した。note や X に貼ったリンクの受け皿
  '/sns-post-analysis': '/x-impressions-drop',
  '/docs/growth-to-100.md': '/x-impressions-drop',
  '/docs/learning-loop.md': '/sns-weekly-review',
  '/docs/principles.md': '/sns-weekly-review',
  '/docs/comparison.md': '/sns-weekly-review',
  '/docs/system-overview.md': '/about',
  '/docs/geo-learnings.md': '/about',
  '/docs/geo-learnings-2.md': '/about',
  '/llms-full.txt': '/llms.txt',
  // 2026-09-22: 下書きを drafts/ に置いた間だけ公開されていた URL の受け皿
  '/drafts/bot-detection-on-cloudflare-pages.md': '/cloudflare-bot-detection',
};

// 人が共有・検索から読むための固定URL。Markdown の直URLは AI / ツール連携用に維持し、
// サイト内の導線と sitemap はこちらに統一する。
const READER_ROUTES: Record<string, string> = {
  '/ai-x-operation': '/docs/ai-x-account-6-months.md',
  '/sns-weekly-review': '/docs/weekly-review-template.md',
  '/weekly': '/docs/weekly-reports.md',
  '/x-impressions-drop': '/docs/x-impressions-drop.md',
  '/cloudflare-bot-detection': '/docs/bot-detection-on-cloudflare-pages.md',
  '/cloudflare-web-analytics-beacon': '/docs/web-analytics-beacon-on-pages-functions.md',
  '/about': '/about.md',
};

// 週報は毎週1本増えるので、固定表ではなく URL の形から原稿を引く。
// /weekly/2026-w39 → /docs/weekly-report-2026-w39.md
function resolveReaderSource(pathname: string): string | undefined {
  const fixed = READER_ROUTES[pathname];
  if (fixed) return fixed;
  const weekly = pathname.match(/^\/weekly\/(\d{4}-w\d{2})$/);
  return weekly ? `/docs/weekly-report-${weekly[1]}.md` : undefined;
}

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

// 同期先: schema/views.sql の access_logs_classified が同じ規則を SQL で持つ
// （過去ログを遡って再判定するため）。この関数を変えたら views.sql も直して流し直すこと
function detectOtherBot(userAgent: string): boolean {
  if (!userAgent) return true; // UA 空は正規ブラウザではあり得ない → 機械アクセス扱い
  if (OTHER_BOT_UA_REGEX.test(userAgent)) return true;
  // 2026-09-22 追加: Mozilla/ で始まらない UA は正規ブラウザではない。
  // 従来は OTHER_BOT_UA_REGEX の語彙に依存していたため、自ら scanner と名乗る UA を
  // 取りこぼしていた（Palo Alto Cortex Xpanse 15 / visionheight.com/scan 9 /
  // crusader-worker 8 / domain-harvester 2 hit が human 扱いだった）。
  // 全期間の非 Mozilla UA を D1 で洗い出したところ人間の閲覧は1件も無かったため、
  // 語彙の追加ではなく前方一致で切る
  if (!userAgent.startsWith('Mozilla/')) return true;
  // 2026-07-07 追加: UA 完全性チェック。Mozilla を名乗るなら本物ブラウザには必ず
  // Chrome/Firefox/Safari/Edg/OPR/Trident のバージョンタグが含まれる。
  // 抜けているものは偽装 UA（scanner の常套手段）。
  // 事例: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" が / を
  // 定期 poll しつつ referer null で ZA から 11 回。本物 Chrome なら末尾に Chrome/x + Safari/x が付く
  if (!/(Chrome|Firefox|Safari\/[\d.]+|Edg|OPR|Trident|Version\/[\d.]+)/i.test(userAgent)) {
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

// 「畑の観察記録」を企業のリサーチレポートとして整えたエディトリアルデザイン。
// AIサービスにありがちな青緑のグラデーションや丸いカードを避け、葉色・土色・記録番号で固有性を出す。
const VIEW_CSS = `
:root {
  color-scheme: light;
  --bg: #f2f3eb;
  --surface: #fff;
  --surface-soft: #e8ede3;
  --ink: #17382b;
  --text: #3e5148;
  --muted: #5f7067;
  --line: #ccd5ca;
  --line-strong: #aab9ab;
  --primary: #35664d;
  --primary-dark: #204c37;
  --primary-soft: #dce7d9;
  --accent: #c96336;
  --accent-soft: #f1dfd2;
  --sky: #688fa0;
  --content-width: 960px;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; background: var(--bg); }
body {
  counter-reset: report-section;
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif;
  font-size: 16px;
  min-height: 100vh;
  margin: 0;
  padding: 0 24px 64px;
  color: var(--text);
  background: var(--bg);
  line-height: 1.85;
  letter-spacing: 0.02em;
  overflow-wrap: anywhere;
}
body > :where(:not(.site-head, .site-nav, .reading-progress, script, .stat-grid, .route-grid, .flow)) {
  width: min(100%, var(--content-width));
  margin-left: auto;
  margin-right: auto;
}
body > .stat-grid, body > .route-grid, body > .flow {
  width: min(100%, var(--content-width));
  margin-left: auto;
  margin-right: auto;
}
h3, h4, th, .brand, .site-nav a, .route-q, .stat-label, .flow-step strong, .flow-who, .reader-next strong {
  font-family: "Noto Sans JP", "Hiragino Sans", sans-serif;
}
h1, h2 { font-family: "Noto Serif JP", "Yu Mincho", serif; }
h1, h2, h3, h4 { color: var(--ink); font-weight: 700; letter-spacing: -0.02em; }
@supports (word-break: auto-phrase) { h1, h2, h3, h4 { word-break: auto-phrase; text-wrap: balance; } }
h1 { position: relative; font-size: clamp(1.85rem, 3.6vw, 2.65rem); line-height: 1.48; margin-top: 1.1em; margin-bottom: 0.5em; }
h1::before { display: block; margin-bottom: 1.1rem; color: var(--accent); font-family: "Manrope", sans-serif; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em; }
.home h1::before { content: "FIELD NOTE  /  006 MONTHS"; }
.article h1::before { content: "OBSERVATION LOG"; }
h2 { counter-increment: report-section; display: grid; grid-template-columns: 2.6rem 1fr; gap: 0.25em; align-items: baseline; scroll-margin-top: 5rem; font-size: clamp(1.4rem, 3vw, 1.85rem); line-height: 1.5; margin-top: 3.2em; margin-bottom: 1em; padding-bottom: 0.6em; border-bottom: 1px solid var(--line-strong); }
h2::before { content: counter(report-section, decimal-leading-zero); color: var(--accent); font-family: "Manrope", sans-serif; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; }
h3 { font-size: 1.15rem; line-height: 1.55; margin-top: 2.2em; margin-bottom: 0.6em; }
p, ul, ol { margin-top: 0; margin-bottom: 1.2em; }
li + li { margin-top: 0.35em; }
li::marker { color: var(--primary); }
strong { color: var(--ink); font-weight: 700; }
h1 + p { margin-top: 0; margin-bottom: 2em; color: var(--muted); line-height: 1.7; }
h1 + p em { font-size: 0.82em; font-style: normal; font-variant-numeric: tabular-nums; }
pre, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.86em; }
pre { padding: 1.2em 1.35em; overflow-x: auto; color: #edf2e9; background: var(--ink); border-radius: 2px; line-height: 1.7; }
code { padding: 0.12em 0.38em; background: var(--surface-soft); border-radius: 2px; }
pre code { padding: 0; background: none; }
table { display: table; width: min(100%, var(--content-width)); max-width: 100%; border-collapse: collapse; margin: 1.5em auto 1.8em; font-size: 0.9em; line-height: 1.65; background: var(--surface); border-top: 2px solid var(--primary); border-bottom: 1px solid var(--line-strong); }
th, td { min-width: 5.5em; padding: 0.75em 0.9em; border-bottom: 1px solid var(--line); text-align: start; vertical-align: top; font-variant-numeric: tabular-nums; overflow-wrap: normal; }
th[align="right"], td[align="right"] { text-align: right; }
th[align="center"], td[align="center"] { text-align: center; }
th:first-child, td:first-child { min-width: 11em; }
tr:last-child td { border-bottom: none; }
th { color: var(--ink); background: var(--surface-soft); white-space: normal; overflow-wrap: anywhere; font-weight: 700; font-size: 0.92em; }
blockquote { position: relative; margin-top: 1.5em; margin-bottom: 2.3em; padding: 1.35em 1.5em; color: var(--text); background: var(--surface); border: 0; font-size: 0.95em; line-height: 1.85; }
blockquote p { margin: 0; }
blockquote strong:first-child { display: block; margin-bottom: 0.35em; color: var(--accent); font-family: "Manrope", sans-serif; font-size: 0.7em; letter-spacing: 0.14em; }
hr { margin-top: 3em; margin-bottom: 3em; border: none; border-top: 1px solid var(--line); }
img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line-strong); }
a { color: var(--primary-dark); text-decoration-thickness: 1px; text-underline-offset: 0.25em; }
a:hover { color: var(--accent); }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.reading-progress { position: fixed; inset: 0 0 auto; z-index: 20; width: 100%; height: 3px; pointer-events: none; }
.reading-progress span { display: block; width: 100%; height: 100%; background: var(--accent); transform: scaleX(0); transform-origin: left center; will-change: transform; }
.site-head { width: min(100%, var(--content-width)); margin: 0 auto; padding: 22px 0 18px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em; text-decoration: none; }
.brand::before { content: ""; width: 24px; height: 31px; flex: none; border-radius: 100% 0 100% 0; background: var(--primary); transform: rotate(-38deg); }
.brand:hover { color: var(--primary-dark); }
.site-purpose { color: var(--muted); font-size: 0.76rem; line-height: 1.55; margin: 0; flex: 1 1 300px; }
.site-nav { width: min(100%, var(--content-width)); display: flex; gap: 4px 22px; margin: 0 auto 48px; padding: 12px 0; overflow-x: auto; scrollbar-width: none; font-size: 0.82rem; border-bottom: 1px solid var(--line-strong); }
.site-nav::-webkit-scrollbar { display: none; }
.site-nav a { flex: none; padding: 5px 0; color: var(--muted); text-decoration: none; white-space: nowrap; font-weight: 500; transition: color 0.2s ease; }
.site-nav a:hover { color: var(--ink); }
.site-nav a[aria-current="page"] { color: var(--primary-dark); font-weight: 700; }
.page-toc { margin-top: 2.8em; margin-bottom: 3.5em; padding: 1.3em 1.5em 1.5em; background: rgba(251, 252, 247, 0.94); }
.page-toc summary { display: flex; align-items: center; justify-content: space-between; gap: 1em; color: var(--ink); cursor: pointer; font-weight: 700; list-style: none; }
.page-toc summary::-webkit-details-marker { display: none; }
.page-toc summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.page-toc summary::after { content: "+"; color: var(--accent); font-family: "Manrope", sans-serif; font-size: 1.1em; font-weight: 600; }
.page-toc[open] summary::after { content: "−"; }
.page-toc ol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45em 2em; margin: 1.2em 0 0; padding: 0; list-style: none; }
.page-toc li + li { margin-top: 0; }
.page-toc a { display: grid; grid-template-columns: 2.2em 1fr; gap: 0.25em; align-items: baseline; padding: 0.3em 0; color: var(--text); text-decoration: none; line-height: 1.55; }
.page-toc a:hover { color: var(--ink); }
.page-toc-index { color: var(--accent); font-family: "Manrope", sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.08em; }
.reader-next { margin-top: 3em; padding: 1.4em 1.5em; background: var(--surface); border: 0; }
.reader-next strong { display: block; margin-bottom: 0.4em; color: var(--ink); font-size: 1.05em; }
.reader-next p { margin: 0.45em 0; line-height: 1.6; }
.reader-next p a::before { content: "↳ "; color: var(--accent); }
.view-footer { margin-top: 2.5em; color: var(--muted); font-size: 0.76em; text-align: center; }
.view-footer a { color: inherit; }
.stat-grid { list-style: none; padding: 0; margin-top: 2em; margin-bottom: 3em; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.stat-grid li + li { margin-top: 0; }
.stat { position: relative; min-height: 158px; padding: 1.35em 1.15em 1.1em; display: flex; flex-direction: column; justify-content: space-between; gap: 0.7em; color: var(--text); background: rgba(251, 252, 247, 0.94); border: 0; }
.stat-value { color: var(--ink); font-family: "Manrope", "Noto Sans JP", sans-serif; font-size: 1.75em; font-weight: 700; letter-spacing: -0.04em; line-height: 1.15; font-variant-numeric: tabular-nums; }
.stat-value small { font-size: 0.45em; font-weight: 600; letter-spacing: 0; }
.stat-label { color: var(--muted); font-size: 0.74em; line-height: 1.6; font-weight: 500; }
.flow { list-style: none; padding: 0; margin-top: 1.5em; margin-bottom: 2em; }
.flow-step { position: relative; display: grid; grid-template-columns: 4em 1fr; column-gap: 1em; padding: 1em 1.1em; background: rgba(251, 252, 247, 0.92); border: 0; }
.flow li + li { margin-top: 7px; }
.flow-step strong { grid-column: 2; line-height: 1.5; }
.flow-step > span:last-child { grid-column: 2; color: var(--muted); font-size: 0.82em; line-height: 1.65; }
.flow-who { grid-row: 1 / span 2; align-self: center; display: inline-flex; align-items: center; justify-content: center; width: 4em; min-height: 2.2em; color: var(--primary-dark); background: var(--primary-soft); border: 0; font-size: 0.7em; font-weight: 700; letter-spacing: 0.08em; }
.flow-step.is-human .flow-who { color: #884426; background: var(--accent-soft); }
.route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 1.5em; margin-bottom: 2em; }
.route-card { display: flex; flex-direction: column; gap: 0.7em; min-height: 160px; padding: 1.35em 1.4em; color: var(--text); background: rgba(251, 252, 247, 0.72); border: 0; text-decoration: none; transition: background-color 0.18s ease; }
.route-card:hover { color: var(--text); background: var(--surface-soft); transform: none; }
.route-q { color: var(--ink); font-size: 1.02em; font-weight: 700; line-height: 1.65; }
.route-a { margin-top: auto; color: var(--muted); font-family: "Manrope", "Noto Sans JP", sans-serif; font-size: 0.76em; line-height: 1.55; font-weight: 600; letter-spacing: 0.02em; }
.route-a::after { content: "  ↗"; color: var(--accent); }
@media (max-width: 760px) {
  body { padding-left: 18px; padding-right: 18px; font-size: 15px; }
  .site-head { padding-top: 18px; }
  .site-purpose { display: none; }
  .site-nav { width: calc(100% + 36px); margin-left: -18px; margin-right: -18px; margin-bottom: 36px; padding-left: 18px; padding-right: 3em; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 3em), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 3em), transparent); }
  .page-toc { padding: 1.1em 1.2em 1.25em; }
  .page-toc ol { grid-template-columns: 1fr; }
  table { display: block; width: 100%; overflow-x: auto; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75em; }
  .stat { min-height: 145px; padding: 1em; }
  .stat-value { font-size: 1.5em; }
  .route-grid { grid-template-columns: 1fr; }
  .route-card { min-height: auto; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .route-card { transition: none; }
  .route-card:hover { transform: none; }
}
`.trim();

function extractDescription(md: string): string {
  // TL;DR ブロックを優先抽出（GEO 最適化）
  const tldrMatch = md.match(/>\s*\*\*TL;DR[：:]?\*\*\s*[：:]?\s*([^\n]+(?:\n>[^\n]+)*)/);
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

function extractPublishedDate(markdown: string): string {
  const match = markdown.match(/(?:公開|公開日)\s*:\s*(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : '2026-05-06';
}

function buildJsonLd(title: string, description: string, rawPath: string, canonicalUrl: string, markdown: string): string {
  const publishedDate = extractPublishedDate(markdown);
  if (rawPath === '/about.md') {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        name: '@ojiichan_hatake',
        url: canonicalUrl,
        sameAs: ['https://x.com/ojiichan_hatake'],
        description,
      },
      inLanguage: 'ja',
      isAccessibleForFree: true,
    });
  }
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description: description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: publishedDate,
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
    keywords: 'AI SNS自動投稿, X自動投稿, 事業者SNS運用, AIペルソナ運用, X運用実測',
  };
  return JSON.stringify(ld);
}

function buildHtmlPage(
  html: string,
  title: string,
  rawPath: string,
  markdown: string,
  canonicalPath = rawPath,
  webAnalyticsToken?: string,
): string {
  const safeTitle = escapeHtml(title);
  const safeRaw = escapeHtml(rawPath);
  const description = extractDescription(markdown);
  const safeDescription = escapeHtml(description);
  const canonicalUrl = `https://ai-ojiichan-system.pages.dev${canonicalPath}`;
  const jsonLd = buildJsonLd(title, description, rawPath, canonicalUrl, markdown);
  // Web Analytics は JS Snippet 方式で登録しており、自動挿入はされない。
  // HTML はここで組み立てるので、環境変数の site token でビーコンを明示的に追加する。
  // token が未設定のローカル開発環境ではスクリプトを出力しない。
  const webAnalyticsBeacon = webAnalyticsToken
    ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${escapeHtml(webAnalyticsToken)}"}'></script>`
    : '';
  // 共通の「次に読む」は、本文に自前の案内があるページでは出さない（同じ案内が2回続くため）。
  // 対象: 「## 次に読む…」「## あわせて読む」の見出し、末尾の「---」に続くリンクの列、入口カード（トップ・404）
  const hasOwnNext = /^##\s*(次に読む|あわせて読む)/m.test(markdown)
    || /\n---\s*\n+(?:\s*-\s*\[[^\]]+\]\([^)]+\).*\n?)+\s*$/.test(markdown)
    || markdown.includes('class="route-grid"');
  const readerNext = hasOwnNext
    ? ''
    : `<hr>
<aside class="reader-next" aria-label="次に読む記事">
  <strong>次に読む</strong>
  <p><a href="/ai-x-operation">AIにXの投稿をどこまで任せられるか：人に残った3つの仕事と費用</a></p>
  <p><a href="/x-impressions-drop">自動で投稿しているのに伸びないとき、投稿を直す前に見る4項目</a></p>
  <p><a href="/sns-weekly-review">5分で終わる週1回の振り返りシート</a></p>
  <p><a href="/weekly">毎週の実測（最新週から）</a></p>
  <p><a href="/about">観測範囲と公開方針</a></p>
</aside>`;
  // コーポレートサイトらしい一貫した導線にするため、ヘッダーとナビはトップを含む全ページに出す。
  const sitePurpose = `<header class="site-head">
  <a class="brand" href="/">AI農業先生方式</a>
  <p class="site-purpose">AIにSNSの投稿を任せたい事業者向けに、1つのXアカウントを6ヶ月自動投稿した実測を公開しています。</p>
</header>`;
  // いま読んでいるページに aria-current を付ける。週報（/weekly/2026-wNN）は「毎週の実測」の下にあるので、そこを示す
  const navItems: Array<[string, string]> = [
    ['/', 'トップ'],
    ['/ai-x-operation', 'AIにどこまで任せられるか'],
    ['/x-impressions-drop', '伸びないときの見方'],
    ['/sns-weekly-review', '週1回の振り返りシート'],
    ['/weekly', '毎週の実測'],
    ['/about', 'このサイトについて'],
  ];
  const isCurrent = (href: string): boolean =>
    href === '/' ? canonicalPath === '/' : canonicalPath === href || canonicalPath.startsWith(`${href}/`);
  // スマホではナビが横スクロールになり、後ろのほうのページだと印の付いた項目が画面外に出る。
  // 読み込み時にナビの中だけを横にずらして、いまの項目を中央に寄せる（本文には触れない）
  const siteNav = `<nav class="site-nav" aria-label="サイト内ナビゲーション">
${navItems.map(([href, label]) => `  <a href="${href}"${isCurrent(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
</nav>
<script>(function(){var n=document.querySelector('.site-nav'),c=n&&n.querySelector('[aria-current]');if(c&&n.scrollWidth>n.clientWidth){n.scrollLeft=c.offsetLeft-n.offsetLeft-(n.clientWidth-c.offsetWidth)/2;}})();</script>`;
  // Markdownに手書きされた関連記事も、共通の「次に読む」ボックスへ変換する。
  // 記事ごとに選んだリンクだけを表示し、通常の章番号や目次には含めない
  const customReaderNextMatch = html.match(/<h2[^>]*>(?:次に読むページ|あわせて読む)<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i);
  const htmlWithCustomReaderNext = customReaderNextMatch
    ? html.replace(
      customReaderNextMatch[0],
      `<aside class="reader-next" aria-label="次に読む記事">
  <strong>次に読む</strong>
${customReaderNextMatch[1].replace(/<li>\s*(<a\b[\s\S]*?<\/a>)[\s\S]*?<\/li>/gi, '  <p>$1</p>')}
</aside>`,
    )
    : html;
  // 記事の h2 から目次を自動生成する。導入文の直後に置き、本文と目次のリンク先を常に同期させる
  const tocItems: Array<{ id: string; label: string }> = [];
  const htmlWithHeadingIds = htmlWithCustomReaderNext.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_match, attrs: string, headingHtml: string) => {
    const id = `section-${String(tocItems.length + 1).padStart(2, '0')}`;
    const label = headingHtml.replace(/<[^>]*>/g, '').trim();
    tocItems.push({ id, label });
    const cleanAttrs = attrs.replace(/\s+id=(?:"[^"]*"|'[^']*')/i, '');
    return `<h2${cleanAttrs} id="${id}">${headingHtml}</h2>`;
  });
  const shouldShowToc = rawPath !== '/index.md' && rawPath !== '/404' && tocItems.length >= 2;
  const pageToc = shouldShowToc
    ? `<details class="page-toc" open>
  <summary>このページの内容</summary>
  <ol>
${tocItems.map(({ id, label }, index) => `    <li><a href="#${id}"><span class="page-toc-index">${String(index + 1).padStart(2, '0')}</span><span>${label}</span></a></li>`).join('\n')}
  </ol>
</details>`
    : '';
  const contentHtml = shouldShowToc
    ? htmlWithHeadingIds.replace(/<h2\b/i, `${pageToc}\n<h2`)
    : html;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} — AI農業先生方式</title>
<meta name="description" content="${safeDescription}">
<meta name="robots" content="index, follow">
<meta name="google-site-verification" content="fuTMLD_lGpfrl7HahiI0rqBBzo2B6rnSm6qQ5njg3TE">
<meta name="keywords" content="AI SNS 自動投稿, X 自動投稿, 事業者 SNS 運用, AI ペルソナ運用, X 運用 実測, AI農業先生方式">
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@600;700&display=swap">
<style>${VIEW_CSS}</style>
</head>
<body class="${rawPath === '/index.md' ? 'home' : 'article'}">
<div class="reading-progress" aria-hidden="true"><span></span></div>
${sitePurpose}
${siteNav}
${contentHtml}
${readerNext}
<p class="view-footer">
  CC-BY 4.0 / 著者: @ojiichan_hatake / <a href="${safeRaw}">Markdown版を読む</a>
</p>
<script>(function(){var b=document.querySelector('.reading-progress span'),toc=document.querySelector('.page-toc'),busy=false,mobile=matchMedia('(max-width: 760px)');if(toc&&mobile.matches)toc.removeAttribute('open');function update(){var d=document.documentElement,m=d.scrollHeight-innerHeight,p=m>0?scrollY/m:0;b.style.transform='scaleX('+Math.max(0,Math.min(1,p))+')';busy=false;}function request(){if(!busy){busy=true;requestAnimationFrame(update);}}if(toc)toc.addEventListener('click',function(event){var target=event.target;if(mobile.matches&&target instanceof Element&&target.closest('a'))toc.removeAttribute('open');});addEventListener('scroll',request,{passive:true});addEventListener('resize',request);update();})();</script>
${webAnalyticsBeacon}
</body>
</html>`;
}

// 人が開いた存在しないページ用。以前は空白の画面になっていた。
// 記事と同じ枠で出し、検索に載らないよう noindex にして記事用の JSON-LD は外す
const NOT_FOUND_MD = `# このページは見つかりませんでした

URLが変わったか、削除されたページです。下の入口から探してください。

<div class="route-grid">
  <a class="route-card" href="/"><span class="route-q">トップページ</span><span class="route-a">サイトの全体と6ヶ月の数字</span></a>
  <a class="route-card" href="/ai-x-operation"><span class="route-q">AIにどこまで任せられて、何が人に残るか</span><span class="route-a">仕組み・費用・事故</span></a>
  <a class="route-card" href="/x-impressions-drop"><span class="route-q">自動で投稿しているのに伸びない</span><span class="route-a">直す前に見る4項目</span></a>
  <a class="route-card" href="/weekly"><span class="route-q">毎週の実測</span><span class="route-a">最新週から</span></a>
</div>
`;

async function buildNotFoundResponse(webAnalyticsToken?: string): Promise<Response> {
  const html = await marked.parse(NOT_FOUND_MD, { gfm: true, breaks: false });
  const page = buildHtmlPage(html, 'ページが見つかりません', '/404', NOT_FOUND_MD, '/404', webAnalyticsToken)
    .replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex">')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '')
    .replace(/<link rel="(?:alternate|canonical)"[^>]*>\n?/g, '')
    .replace(/ \/ <a href="\/404">Markdown版を読む<\/a>/, '');
  return new Response(page, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  });
}

// 拡張子のないパスか .md を、ブラウザが HTML として求めているときだけ人向けの 404 を返す。
// 画像・txt・xml や機械アクセスには、従来どおり素の 404 を返す
function wantsHtmlPage(request: Request, pathname: string): boolean {
  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/html')) return false;
  const last = pathname.split('/').pop() || '';
  return !last.includes('.') || last.endsWith('.md');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 管理画面（/admin/*）には middleware を通さない（admin route 自体で auth する）
  if (url.pathname.startsWith('/admin/')) {
    return next();
  }

  // Scanner noise: skip logging probes for common secret/config paths.
  // パスが / のままでも、phpinfo 等の探査クエリを付けてトップページの
  // 200 を引き出そうとする scanner があるため、クエリ名も検査する。
  const isScannerNoiseQuery = /(?:^|[?&])(phpinfo|xdebug|debug|cmd|shell|eval)(?:=|&|$)/i.test(url.search);
  // WordPress REST API は `/?rest_route=/wp/v2/...` の形式でも呼ばれる。
  // 本サイトには WordPress / REST API がないため、トップページの 200 を返さず probe として遮断する。
  // URLSearchParams を使うことで、`rest_route` が URL エンコードされていても検出できる。
  const isWordPressRestProbe = url.searchParams.has('rest_route');
  if (isScannerNoisePath(url.pathname) || isScannerNoiseQuery || isWordPressRestProbe) {
    return new Response('Not Found', { status: 404 });
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const referer = request.headers.get('Referer') || null;
  const country = (request as any).cf?.country || null;
  // 2026-09-22 追加: 接続元ネットワークの素性。country + user_agent だけでは
  // 同一 UA が9カ国11IPに分散する scanner 群（住宅プロキシ網かデータセンターか）を
  // 判別できなかった。asn/as_organization があれば UA 偽装と無関係に切り分けられる
  const asn = (request as any).cf?.asn ?? null;
  const asOrganization = (request as any).cf?.asOrganization || null;
  const colo = (request as any).cf?.colo || null;
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
            ip_hash, country, referer, status_code, is_other_bot,
            asn, as_organization, colo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            is_other_bot ? 1 : 0,
            asn,
            asOrganization ? asOrganization.slice(0, 200) : null,
            colo
          )
          .run();
      } catch (err) {
        console.error('access_log insert failed:', err);
      }
    })());
  };

  // 旧来の人間向け URL を正規のクエリなし URL へ統合する。
  // UTM 等の他パラメータは引き継ぐ。
  if (url.pathname === '/about.md' && url.searchParams.has('view')) {
    const redirectUrl = new URL('/about', url.origin);
    url.searchParams.delete('view');
    redirectUrl.search = url.searchParams.toString();
    logRequest(301);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  // 削除済みの記事は恒久的に対応先へ移転する。クエリ文字列も維持し、
  // 旧URLの ?view 閲覧や UTM パラメータを失わないようにする。
  const legacyDestination = LEGACY_REDIRECTS[url.pathname];
  if (legacyDestination) {
    const redirectUrl = new URL(legacyDestination, url.origin);
    redirectUrl.search = url.search;
    logRequest(301);
    return Response.redirect(redirectUrl.toString(), 301);
  }

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
    const fullPage = buildHtmlPage(html, title, '/index.md', md, '/', env.CF_WEB_ANALYTICS_TOKEN);

    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', '/index.md');
    setProductionRobotsHeader(headers, url);
    if (is_ai_bot && bot_name) {
      headers.set('X-Detected-Bot', bot_name);
    }
    logRequest(200);
    return new Response(fullPage, { status: 200, headers });
  }

  // 検索結果や共有リンクからは拡張子・クエリのないURLで読ませる。
  // 原文の .md は llms.txt 等から参照する機械可読な入口として残す。
  const readerSourcePath = resolveReaderSource(url.pathname);
  if (readerSourcePath) {
    const sourceUrl = new URL(readerSourcePath, url.origin);
    const assetResponse = await env.ASSETS.fetch(sourceUrl.toString());
    if (!assetResponse.ok) {
      logRequest(404);
      return buildNotFoundResponse(env.CF_WEB_ANALYTICS_TOKEN);
    }
    const md = await assetResponse.text();
    let html: string;
    try {
      html = await marked.parse(md, { gfm: true, breaks: false });
    } catch (err) {
      console.error('reader route render failed:', err);
      logRequest(500);
      return new Response('Render error', { status: 500 });
    }
    html = preserveViewInLinks(html);
    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', readerSourcePath);
    setProductionRobotsHeader(headers, url);
    if (is_ai_bot && bot_name) headers.set('X-Detected-Bot', bot_name);
    logRequest(200);
    return new Response(
      buildHtmlPage(html, extractTitle(md), readerSourcePath, md, url.pathname, env.CF_WEB_ANALYTICS_TOKEN),
      { status: 200, headers },
    );
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
    const fullPage = buildHtmlPage(html, title, url.pathname, md, url.pathname, env.CF_WEB_ANALYTICS_TOKEN);

    const headers = new Headers();
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('X-AI-Friendly', 'true');
    headers.set('X-Content-License', 'CC-BY-4.0');
    headers.set('X-Markdown-Source', url.pathname);
    setProductionRobotsHeader(headers, url);
    if (is_ai_bot && bot_name) {
      headers.set('X-Detected-Bot', bot_name);
    }
    logRequest(200);
    return new Response(fullPage, { status: 200, headers });
  }

  if (response.status === 404 && wantsHtmlPage(request, url.pathname)) {
    logRequest(404);
    return buildNotFoundResponse(env.CF_WEB_ANALYTICS_TOKEN);
  }

  // それ以外: AI 向け raw 配信 + 識別ヘッダ付与
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-AI-Friendly', 'true');
  newHeaders.set('X-Content-License', 'CC-BY-4.0');
  setProductionRobotsHeader(newHeaders, url);
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
