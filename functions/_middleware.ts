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

// オールドポップ: クリーム地に、トマト赤・からし・焦げ茶の3色だけ。太い線とぼかさないずらし影。
// 読みやすさのため、水玉は本文の外（画面の余白）にだけ敷き、本文の列は無地にする。
// 看板書体（Dela Gothic One）はサイト名と数字だけに使い、見出しは丸ゴシックの極太で組む。
// 色は :root のトークンだけで決め、ダークモードはトークンの差し替えで済ませる。人＝トマト赤、AI＝焦げ茶
const VIEW_CSS = `
:root {
  color-scheme: light dark;
  --bg: #fbf1dc;
  --margin-bg: #f4e3c1;
  --dot: rgba(74, 46, 30, 0.10);
  --surface: #fffaf0;
  --surface-muted: #f6e6c4;
  --ink: #3b2418;
  --text: #2a1a12;
  --text-muted: #5c463a;
  --shadow: #3b2418;
  --red: #d9422a;
  --red-soft: #fbe0d6;
  --mustard: #f2b43c;
  --mustard-soft: #fdecc0;
  --link: #a8321b;
  --on-color: #fffaf0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #231b16;
    --margin-bg: #1b1511;
    --dot: rgba(255, 226, 180, 0.07);
    --surface: #2d231d;
    --surface-muted: #3a2d25;
    --ink: #f0ddb8;
    --text: #f6ecd8;
    --text-muted: #d0bda2;
    --shadow: #000000;
    --red: #ef6a4f;
    --red-soft: #45261d;
    --mustard: #f2b43c;
    --mustard-soft: #44361a;
    --link: #ffb39c;
    --on-color: #231b16;
  }
}
* { box-sizing: border-box; }
html {
  -webkit-text-size-adjust: 100%;
  background-color: var(--margin-bg);
  background-image: radial-gradient(var(--dot) 1.4px, transparent 1.6px);
  background-size: 18px 18px;
}
body {
  font-family: "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif;
  font-weight: 500;
  font-size: 17px;
  max-width: 760px;
  min-height: 100vh;
  margin: 0 auto;
  --gutter: 24px;
  padding: 0 var(--gutter) 4rem;
  line-height: 1.95;
  letter-spacing: 0.02em;
  color: var(--text);
  background: var(--bg);
  overflow-wrap: anywhere;
}
.stat-value, .brand {
  font-family: "Dela Gothic One", "Hiragino Sans", "Yu Gothic", sans-serif;
  font-weight: 400;
}
h1, h2, h3, h4 { font-weight: 900; line-height: 1.5; letter-spacing: 0.02em; color: var(--ink); }
/* 見出しの行を揃えるのは、文節で改行できるブラウザだけ。balance 単独だと「投稿していた / のに」のように語の途中で割れる */
@supports (word-break: auto-phrase) {
  h1, h2, h3, h4 { word-break: auto-phrase; text-wrap: balance; }
}
h1 { font-size: 1.75em; margin: 0.9em 0 0.5em; }
h1 { background: linear-gradient(transparent 60%, var(--mustard) 60%, var(--mustard) 92%, transparent 92%); display: inline; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
h2 {
  font-size: 1.32em;
  margin: 2.6em 0 0.9em;
  padding-bottom: 0.25em;
  border-bottom: 3px solid var(--ink);
}
h2::before {
  content: "";
  display: inline-block;
  width: 0.62em;
  height: 0.62em;
  margin: 0 0.5em 0.08em 0;
  background: var(--red);
  border: 2px solid var(--ink);
  border-radius: 50%;
  vertical-align: baseline;
}
h3 { font-size: 1.12em; margin: 1.9em 0 0.5em; padding-bottom: 0.1em; background: linear-gradient(transparent 70%, var(--mustard-soft) 70%); display: inline; }
p, ul, ol { margin: 0 0 1.1em; }
li + li { margin-top: 0.35em; }
li::marker { color: var(--red); }
strong { color: var(--ink); }
h1 + p { margin-top: 1em; }
h1 + p em { color: var(--text-muted); font-size: 0.82em; font-style: normal; }
pre, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.86em; }
pre { background: var(--surface); padding: 1em 1.1em; overflow-x: auto; border: 2px solid var(--ink); border-radius: 12px; box-shadow: 3px 3px 0 var(--shadow); line-height: 1.65; }
code { background: var(--surface-muted); padding: 0.1em 0.35em; border-radius: 5px; }
pre code { background: none; padding: 0; }
/* 表はスマホで列が潰れないよう、表ごと横スクロールさせる */
table { display: block; max-width: 100%; overflow-x: auto; border-collapse: separate; border-spacing: 0; margin: 1.3em 0; font-size: 0.92em; line-height: 1.65; border: 2.5px solid var(--ink); border-radius: 12px; box-shadow: 4px 4px 0 var(--shadow); background: var(--surface); }
th, td { border-bottom: 1.5px solid var(--ink); border-right: 1.5px dashed var(--text-muted); padding: 0.55em 0.85em; text-align: left; vertical-align: top; min-width: 5.5em; }
th:last-child, td:last-child { border-right: none; }
/* 本文の overflow-wrap: anywhere がセルに効くと「8月31 / 日〜9月」のように日付が割れるので、
   セル内は通常の折り返しに戻し、見出し列（期間・指標名）に幅を確保する */
th, td { overflow-wrap: normal; }
th:first-child, td:first-child { min-width: 11em; }
tr:last-child td { border-bottom: none; }
th { background: var(--mustard); color: #33211a; white-space: nowrap; font-weight: 700; }
blockquote {
  position: relative;
  margin: 1.4em 0 1.8em;
  padding: 1.2em 1.2em 1em;
  background: var(--mustard-soft);
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  box-shadow: 5px 5px 0 var(--shadow);
  color: var(--text);
  font-size: 0.95em;
  line-height: 1.85;
}
blockquote p { margin: 0; }
blockquote strong:first-child {
  display: inline-block;
  margin-right: 0.4em;
  padding: 0 0.6em;
  color: var(--on-color);
  background: var(--red);
  border: 2px solid var(--ink);
  border-radius: 999px;
  font-size: 0.85em;
  transform: rotate(-3deg);
}
hr { border: none; height: 10px; margin: 2.6em 0; background: repeating-linear-gradient(-45deg, var(--red) 0 8px, var(--mustard) 8px 16px); border: 2px solid var(--ink); border-radius: 999px; }
/* 記事の図は青い線画なので、少しセピアに寄せて古い印刷物の色にそろえる */
img { max-width: 100%; height: auto; border: 2.5px solid var(--ink); border-radius: 16px; box-shadow: 5px 5px 0 var(--shadow); filter: sepia(0.3) saturate(1.2); }
a { color: var(--link); text-decoration-thickness: 2px; text-underline-offset: 0.2em; }
a:hover { color: var(--red); }
/* サイトの頭: 色の縞と、看板のような名前 */
/* 3色の縞は本文の幅ではなく画面の端から端まで引く（body は position 指定なしなので、
   absolute の基準は初期包含ブロック＝画面幅になる） */
body::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(var(--red) 0 10px, var(--mustard) 10px 16px, var(--ink) 16px 18px, transparent 18px);
}
.site-head {
  margin: 0 0 0.6em;
  padding: 2.1em 0 0.7em;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em 0.8em;
}
.brand {
  display: inline-block;
  font-size: 1.05em;
  color: var(--on-color);
  background: var(--red);
  border: 2.5px solid var(--ink);
  border-radius: 10px;
  padding: 0.1em 0.7em;
  box-shadow: 3px 3px 0 var(--shadow);
  text-decoration: none;
  transform: rotate(-2deg);
}
.brand:hover { color: var(--bg); background: var(--ink); }
.site-purpose { color: var(--text-muted); font-size: 0.78em; line-height: 1.6; margin: 0; flex: 1 1 16em; }
.site-nav {
  display: flex;
  gap: 0.6em;
  margin: 0 calc(-1 * var(--gutter)) 1.5em;
  padding: 0.4em var(--gutter) 0.9em;
  overflow-x: auto;
  scrollbar-width: none;
  font-size: 0.84em;
}
.site-nav::-webkit-scrollbar { display: none; }
.site-nav a {
  flex: none;
  text-decoration: none;
  color: var(--ink);
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 0.25em 0.95em;
  white-space: nowrap;
  box-shadow: 2px 2px 0 var(--shadow);
  font-weight: 700;
}
.site-nav a:hover { background: var(--mustard); color: #33211a; }
.reader-next {
  background: var(--surface);
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  box-shadow: 5px 5px 0 var(--shadow);
  margin-top: 3em;
  padding: 1.1em 1.3em;
  background-image: linear-gradient(var(--red) 0 0);
  background-size: 100% 8px;
  background-repeat: no-repeat;
  padding-top: 1.5em;
}
.reader-next strong { display: block; margin-bottom: 0.4em; font-size: 1.05em; }
.reader-next p { margin: 0.45em 0; line-height: 1.6; }
.reader-next p a::before { content: "★ "; color: var(--red); }
.view-footer { color: var(--text-muted); font-size: 0.8em; margin-top: 2em; text-align: center; }
.view-footer a { color: inherit; }
/* トップページ: 数字のタイル。4色を順に当てる */
.stat-grid {
  list-style: none;
  padding: 0;
  margin: 1.4em 0 1.8em;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9em;
}
.stat-grid li + li { margin-top: 0; }
.stat {
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  box-shadow: 4px 4px 0 var(--shadow);
  padding: 0.9em 0.9em 1em;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  color: var(--text);
}
.stat:nth-child(odd) { background: var(--red-soft); }
.stat:nth-child(even) { background: var(--mustard-soft); }
.stat-value { font-size: 1.6em; line-height: 1.15; font-variant-numeric: tabular-nums; color: var(--ink); }
.stat:nth-child(odd) .stat-value { color: var(--red); }
.stat-value small { font-family: "Zen Maru Gothic", sans-serif; font-size: 0.5em; font-weight: 700; }
.stat-label { font-size: 0.78em; line-height: 1.55; font-weight: 700; }
/* トップページ: 担当ごとの流れ。人＝トマト赤、AI と自動＝青緑 */
.flow { list-style: none; padding: 0; margin: 1.3em 0 1.6em; }
.flow-step {
  display: grid;
  grid-template-columns: 3.6em 1fr;
  column-gap: 0.9em;
  padding: 0.85em 1em;
  border-radius: 16px;
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--shadow);
}
.flow li + li { margin-top: 0.8em; }
.flow-step strong { grid-column: 2; line-height: 1.5; }
.flow-step > span:last-child { grid-column: 2; font-size: 0.84em; line-height: 1.6; color: var(--text-muted); }
.flow-who {
  grid-row: 1 / span 2;
  align-self: center;
  justify-self: center;
  display: grid;
  place-items: center;
  width: 3.1em;
  height: 3.1em;
  font-size: 0.8em;
  font-weight: 700;
  color: var(--on-color);
  border: 2.5px solid var(--ink);
  border-radius: 50%;
  transform: rotate(-8deg);
}
.flow-step.is-human { background: var(--red-soft); }
.flow-step.is-human .flow-who { background: var(--red); }
.flow-step.is-ai { background: var(--surface); }
.flow-step.is-ai .flow-who { background: var(--ink); color: var(--bg); }
/* トップページ: 入口のカード。押すと影の上に沈む */
.route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1em; margin: 1.3em 0 1.8em; }
.route-card {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  padding: 1em 1.1em;
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  box-shadow: 5px 5px 0 var(--shadow);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition: transform 0.12s, box-shadow 0.12s;
}
.route-card:hover { color: var(--text); transform: translate(-2px, -2px); box-shadow: 7px 7px 0 var(--shadow); }
.route-card:active { transform: translate(4px, 4px); box-shadow: 1px 1px 0 var(--shadow); }
.route-q { font-weight: 700; line-height: 1.5; color: var(--ink); }
.route-a { align-self: flex-start; font-size: 0.82em; line-height: 1.5; font-weight: 700; color: var(--on-color); background: var(--red); border: 2px solid var(--ink); border-radius: 10px; padding: 0.2em 0.8em; }
.route-a::after { content: " →"; }
.route-card:nth-child(even) .route-a { background: var(--mustard); color: #2a1a12; }
/* 横スクロールのナビはスマホ用。広い画面では折り返して全部見せる */
@media (min-width: 641px) {
  .site-nav { flex-wrap: wrap; overflow: visible; margin: 0 0 1.5em; padding: 0.4em 0 0.9em; }
}
@media (max-width: 640px) {
  body { --gutter: 18px; font-size: 16px; line-height: 1.9; }
  h1 { font-size: 1.5em; }
  h2 { font-size: 1.2em; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75em; }
  .stat-value { font-size: 1.35em; }
  .route-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .route-card { transition: none; }
  .route-card:hover, .route-card:active { transform: none; }
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
  // 看板（サイト名）は全ページに出す。トップは H1 がサイトの説明を兼ねるので、説明文とナビは記事ページにだけ出す
  const sitePurpose = `<header class="site-head">
  <a class="brand" href="/">AI農業先生方式</a>${rawPath === '/index.md'
    ? ''
    : `
  <p class="site-purpose">AIにSNSの投稿を任せたい事業者向けに、1つのXアカウントを6ヶ月自動投稿した実測を公開しています。</p>`}
</header>`;
  const siteNav = rawPath === '/index.md'
    ? ''
    : `<nav class="site-nav" aria-label="サイト内ナビゲーション">
  <a href="/">トップ</a>
  <a href="/ai-x-operation">AIにどこまで任せられるか</a>
  <a href="/x-impressions-drop">伸びないときの見方</a>
  <a href="/sns-weekly-review">週1回の振り返りシート</a>
  <a href="/weekly">毎週の実測</a>
  <a href="/about">このサイトについて</a>
</nav>`;
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Maru+Gothic:wght@500;700;900&display=swap">
<style>${VIEW_CSS}</style>
</head>
<body>
${sitePurpose}
${siteNav}
${html}
<hr>
<aside class="reader-next" aria-label="次に読む記事">
  <strong>次に読む</strong>
  <p><a href="/ai-x-operation">AIにXの投稿をどこまで任せられるか：人に残った3つの仕事と費用</a></p>
  <p><a href="/x-impressions-drop">自動で投稿しているのに伸びないとき、投稿を直す前に見る4項目</a></p>
  <p><a href="/sns-weekly-review">5分で終わる週1回の振り返りシート</a></p>
  <p><a href="/weekly">毎週の実測（最新週から）</a></p>
  <p><a href="/about">観測範囲と公開方針</a></p>
</aside>
<p class="view-footer">
  CC-BY 4.0 / 著者: @ojiichan_hatake / <a href="${safeRaw}">Markdown版を読む</a>
</p>
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
