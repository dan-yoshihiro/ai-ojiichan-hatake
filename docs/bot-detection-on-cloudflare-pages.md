# Cloudflare Pages で人間とボットを見分ける：「人間」4,165件を数え直したら35%が機械だった

*最終更新: 2026-09-22 / 観測期間: 2026-05-06〜2026-09-22（約4か月半・7,313リクエスト）*

> **TL;DR:** Cloudflare Pages は独自ドメインをゾーン登録していないと、ダッシュボードに Security Events が出ません。国別の件数から先へ進めないので、Pages Functions のミドルウェアで全リクエストを D1 に記録しました。その結果、「人間」と数えていた4,165件のうち1,475件（35%）が機械で、404件は自分自身でした。判定を3回作り直した記録です。

## 何に困っていたか

アクセスの中身を知りたくなったきっかけは、Account analytics の「Requests by country」にベルギーが3件出ていたことでした。心当たりがありません。人なのかボットなのか知りたい。しかしダッシュボードからは、そこから先に進めませんでした。

- **Security Events が無い。** 通常なら国別に ASN や User-Agent まで辿れますが、これは Domains にゾーンを登録している場合の機能です。`*.pages.dev` のまま運用していると存在しません。
- **Web Analytics は未導入。** 実ブラウザのビーコン計測を入れていないので、JavaScript が実行されたかどうかは分かりません。
- **Pages の Metrics は件数だけ。** Functions が受けたリクエスト数と成功・失敗しか出ず、国・ASN・UA の内訳はありません。

つまり「Requests by country」がダッシュボードで見られる一番深い地理情報で、その先は自分で取るしかありませんでした。

## Functions のミドルウェアで全リクエストを記録する

Pages Functions は `functions/_middleware.ts` を置くと全リクエストにフックできます。`request.cf` から Cloudflare が付けた情報を取り出し、D1 に書きます。

```ts
const userAgent = request.headers.get('User-Agent') || '';
const referer = request.headers.get('Referer') || null;
const country = (request as any).cf?.country || null;
const asn = (request as any).cf?.asn ?? null;
const asOrganization = (request as any).cf?.asOrganization || null;
const colo = (request as any).cf?.colo || null;
const ip = request.headers.get('CF-Connecting-IP') || '';
```

書き込みは `context.waitUntil()` に逃がします。ログのために応答を遅らせる理由はありません。

```ts
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
      ).bind(/* ... */).run();
    } catch (err) {
      console.error('access_log insert failed:', err);
    }
  })());
};
```

IP はそのまま保存せず、SHA-256 の先頭16字にしています。同一訪問者をまとめる用途にはこれで足ります。

```ts
async function hashIP(ip: string): Promise<string> {
  if (!ip) return '';
  const data = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
```

記録するタイミングは、リクエスト受信時ではなく応答が確定したあとにしました。受信時に書くと 200 と 404 の区別がつかず、スキャナの探査が成功したのかどうかも分からなくなります。

ひとつ注意があります。`_routes.json` の `include` に載っているパスしか Functions を通りません。除外したパスへのアクセスは記録に残らないので、ダッシュボードの件数とは必ずズレます。実際、ベルギーはダッシュボードが3件、D1 が2件でした。

## 最初の答え：ベルギーは29件すべて機械だった

これで国別の内訳が引けるようになりました。ベルギーは全期間で29件あり、中身はこうでした。

| User-Agent | 件数 | 備考 |
|---|---:|---|
| `Go-http-client/1.1` | 22 | 同一IPから1分未満で連打 |
| Palo Alto Networks Cortex Xpanse | 4 | 資産スキャンサービス |
| `Mozilla/5.0 (compatible; CMS-Checker/1.0; +https://example.com)` | 2 | CMS 探査 |
| `python-requests/2.32.5` | 1 | |

ブラウザらしい UA は1件もありません。人間はゼロでした。ここまでは簡単です。問題はこのあとでした。

## 落とし穴1：語彙リストは必ず漏れる

最初の判定は、UA に含まれる語で機械を弾くやり方でした。

```ts
const OTHER_BOT_UA_REGEX =
  /bot|crawler|spider|slurp|scrapy|curl|wget|python|go-http-client|httpx|aiohttp|okhttp|libwww|java\/|node-fetch|axios|headless|phantomjs|selenium|playwright|puppeteer|facebookexternalhit/i;
```

これで漏れたものがありました。

- `Hello from Palo Alto Networks, find out more about our scans in https://...`（15件）
- `visionheight.com/scan Mozilla/5.0 ...`（9件）
- `crusader-worker/1.0`（8件）
- `domain-harvester/dev (+https://github.com/esc-city/domain-harvester)`（2件）

どれも自分がスキャナだと名乗っているのに、語彙リストに `scan` も `harvester` も無かったので素通りしていました。`scan` を足せば直りますが、それはいたちごっこです。

そこで発想を変え、全期間の非 Mozilla な UA を洗い出しました。結果、人間の閲覧は1件もありませんでした。実在のブラウザは事実上すべて `Mozilla/` で始まります。ならば前方一致で切れます。

```ts
function detectOtherBot(userAgent: string): boolean {
  if (!userAgent) return true;
  if (OTHER_BOT_UA_REGEX.test(userAgent)) return true;
  // Mozilla/ で始まらない UA は正規ブラウザではない
  if (!userAgent.startsWith('Mozilla/')) return true;
  // Mozilla を名乗るのに browser token が無い UA は偽装
  if (!/(Chrome|Firefox|Safari\/[\d.]+|Edg|OPR|Trident|Version\/[\d.]+)/i.test(userAgent)) {
    return true;
  }
  return false;
}
```

最後の判定は、以前 `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` という UA がトップページを定期的に叩いていたときに足したものです。本物の Chrome なら末尾に `Chrome/x` と `Safari/x` が付きます。

## 落とし穴2：書き込み時点の判定は、過去に遡らない

ここで気づきました。判定結果を列として保存していると、ルールを直しても過去のログは古い判定のままです。

数えてみると深刻でした。「人間」に分類されていた4,165件に現行ルールを当て直すと、**1,475件（35%）が機械**に反転します。時期で分けるとこうなりました。

| 時期 | 人間扱い | うち実際は機械 | 割合 |
|---|---:|---:|---:|
| 判定列の導入前 | 2,654 | 1,368 | 52% |
| 導入後 | 1,511 | 107 | 7% |

導入前の汚染が濃いのは当然として、導入後にも7%残っていたのが落とし穴1の分です。

対処として、過去行を `UPDATE` で書き換えるのはやめました。理由は2つあります。ひとつは、判定列は「その時点のコードが何と判断したか」の記録なので、上書きすると数字が動いた理由が「ルールを変えたから」なのか「アクセス傾向が変わったから」なのか区別できなくなること。もうひとつは、ルールは今後も変わるので、そのたびに全行を書き換えることになることです。

代わりに、判定をクエリ時にやり直すビューを作りました。

```sql
CREATE VIEW access_logs_classified AS
SELECT
  *,
  CASE
    WHEN is_ai_bot = 1 THEN 'ai_bot'
    -- 書き込み時点で機械と判定済みの行は覆さない（判定は緩めない）
    WHEN COALESCE(is_other_bot, 0) = 1 THEN 'other_bot'
    WHEN COALESCE(user_agent, '') = '' THEN 'other_bot'
    WHEN LOWER(user_agent) LIKE '%bot%'
      OR LOWER(user_agent) LIKE '%crawler%'
      /* ... 語彙リストの残り ... */
      THEN 'other_bot'
    WHEN user_agent NOT GLOB 'Mozilla/*' THEN 'other_bot'
    WHEN LOWER(user_agent) NOT LIKE '%chrome%'
      AND LOWER(user_agent) NOT LIKE '%firefox%'
      /* ... browser token の残り ... */
      THEN 'other_bot'
    ELSE 'human_candidate'
  END AS kind
FROM access_logs;
```

同じ規則を TypeScript と SQL の2箇所に持つことになるので、大文字小文字の扱いまで合わせておく必要があります。語彙マッチと browser token は正規表現側が `/i` なので `LOWER()` + `LIKE`（SQLite の `LIKE` は既定で大小を区別しない）、`Mozilla/` の前方一致は `startsWith()` が大小を区別するので `GLOB`（こちらは区別する）を使いました。実 UA 25件で両者の判定が一致することを確認しています。

ビュー定義は `DROP` してから `CREATE` する冪等なファイル1本にまとめ、ルールを直したら流し直すだけにしました。

## 落とし穴3：最大の「読者」は自分だった

国別に見ると、日本だけが様子が違いました。452件のうち人間候補が415件。ベルギーとは正反対です。

ところがこの415件は、**わずか11個の IP** から来ていました。IP 別に分解すると一目瞭然でした。

| ip_hash | 件数 | ページ数 | 稼働日数 | 内部referer | 外部referer |
|---|---:|---:|---:|---:|---:|
| 上位1 | 311 | 42 | 18 | 228 | 7 |
| 上位2 | 46 | 18 | 9 | 16 | 2 |
| 上位3 | 27 | 8 | 3 | 6 | 0 |
| 上位4 | 20 | 11 | 5 | 5 | 0 |
| 残り7個 | 計11 | 1-2 | 1 | 0 | 9 |

決め手は内部 referer でした。上位1の311件のうち228件が自サイト内からの遷移、つまりページ内のリンクを踏んで回っています。ボットはリンクを踏まず URL を直接叩くので、この形にはなりません。さらに上位4つはすべて同じ Mac の Chrome で、2番目が8月1日に止まった11日後に1番目が始まっています。プロバイダの割り当てが変わっただけの、同じ端末でした。

結果、日本の人間候補415件のうち**404件が自分**で、外部の読者は11件でした。

除外の実装では、ip_hash をリポジトリに書きませんでした。ip_hash は SHA-256 の先頭16字ですが、IPv4 は約43億通りしかないので、総当たりで元の IP を復元できます。公開リポジトリに置くと自宅 IP の履歴を公開することになります。値は D1 側のテーブルにだけ置き、ビューから参照しました。

```sql
CREATE TABLE IF NOT EXISTS owner_ips (
  ip_hash TEXT PRIMARY KEY,
  note TEXT,
  added_at TEXT
);
```

```sql
CASE WHEN EXISTS (
  SELECT 1 FROM owner_ips o WHERE o.ip_hash = access_logs.ip_hash
) THEN 1 ELSE 0 END AS is_owner
```

`kind` とは別の列にしてあります。運営者の動きだけを見たいこともあるので、混ぜませんでした。

## UA では原理的に見抜けないもの

ここまでで判定はかなり良くなりましたが、UA では手が出ない相手が残りました。直近7日の人間候補158件のうち133件が、たった3種類の汎用デスクトップ UA に集中していたのです。

| User-Agent | 件数 | 国数 | IP数 |
|---|---:|---:|---:|
| Mac の Chrome | 89 | 9 | 11 |
| Windows の Chrome | 29 | 8 | 16 |
| Linux の Chrome | 15 | 7 | 10 |

**同一の UA 文字列が9カ国から来る**のは、住宅プロキシ網かスキャナの分散実行です。しかし UA は完全な形のブラウザを名乗っているので、UA ベースの判定では絶対に見抜けません。

ここで効くのが ASN です。UA は自己申告なので偽装できますが、接続元のネットワークは偽装できません。`request.cf` から取れます。

```ts
const asn = (request as any).cf?.asn ?? null;
const asOrganization = (request as any).cf?.asOrganization || null;
```

`as_organization` が Amazon や DigitalOcean などのデータセンター事業者なら機械です。住宅 ISP なら人間の可能性が出てきますが、住宅プロキシ網は住宅 ISP の ASN を使うため、1つの組織が何カ国にもまたがっている行は依然として疑う必要があります。

これは記録を始めたばかりなので、結論はまだ出ていません。

## 分かったことと、まだ分からないこと

分かったことです。

- ベルギーの29件は全部機械だった。人間はゼロ。
- 「人間」4,165件のうち1,475件（35%）は機械で、404件は自分だった。
- 外部の読者で唯一深く読んだのは note.com から来た1人で、4ページ読んでいた。Google 検索から来た5人は全員トップページだけ見て離脱した。
- AI bot 2,165件のうち、`/robots.txt` が786件、`/sitemap.xml` が635件。**66%は巡回の存在確認**で、本文の取り込みではなかった。

まだ分からないことです。

- 9カ国に散った同一 UA 群が何者か。ASN が溜まるまで判断できない。
- サーバーログだけでは「JavaScript を実行する本物のブラウザか」は原理的に判定できない。ヘッドレスブラウザを住宅プロキシ経由で走らせれば、ログ上は人間と区別がつかない。ここを詰めるならビーコン計測を足すしかない。

## 同じことをやるなら

1. `functions/_middleware.ts` を置いて全リクエストにフックする。
2. `request.cf` から `country` / `asn` / `asOrganization` / `colo` を取る。IP は生で保存せずハッシュにする。
3. 書き込みは `waitUntil()` に逃がし、応答が確定してから status 込みで記録する。
4. 判定結果は列に持つが、集計はビュー経由にする。ルールは必ず変わる。
5. 自分の ip_hash は最初に登録して除外する。でないと自分が最大の読者になる。
6. `_routes.json` の include 外は記録されないことを忘れない。

---

*この記録は1つのサイトの観測です。他の環境で同じ数字になることは保証しません。*
