# Web Analytics に登録したのに、Pages Functions が返す HTML にビーコンが無かった

*最終更新: 2026-09-25*

> **TL;DR:** Cloudflare Web Analytics にサイトを登録しただけで、計測できているつもりでした。登録は JS Snippet を自分で貼る方式で、Pages Functions が組み立てる HTML には誰もスニペットを入れていませんでした。数字が出ないときは、設定画面より先に実際の応答 HTML を `curl` で確かめます。入っていなければ、HTML を組み立てる関数に `<script>` を1か所足せば済みます。

Pages Functions で HTML を生成している人向けの記録です。「Web Analytics に登録したのにデータが出ない」ときに、どこから確かめればいいかを書きます。サーバーログで人間とボットを数え直した経緯は[「人間」4,165件を数え直したら35%が機械だった](/cloudflare-bot-detection)にあります。この記事はその途中で見つけた、計測コードが届いていなかった件だけを扱います。

## Web Analytics の入口は2つある

まず、ここで迷いました。Web Analytics はダッシュボードのどこにあるのか分かりにくく、しかも入口が2つあって、どちらにも「Web Analytics」と書いてあります。

| 入口 | 場所 | ビーコン |
|---|---|---|
| Pages のプロジェクトから | Workers & Pages → プロジェクト → Metrics タブの下の方 → Enable | Cloudflare が入れる |
| アカウントから | 左メニューの Analytics → Web analytics → Add a site | 自分で貼る（JS Snippet） |

このサイトは2つ目で登録していました。Metrics タブを見ると、いまも「Web analytics is disabled」のままです。登録の種類は、Web analytics のサイト一覧で見分けられます。自分で貼る方式なら、サイト名の横に「JS Snippet installation」と出ます。

1つ目の入口で有効にした場合、Functions が組み立てる応答にも Cloudflare がビーコンを入れてくれるのかは試していません。

見られるのは、ページビューと訪問数、どのページがどこから読まれたか、国、ブラウザや端末の内訳です。数えるのはビーコンの JavaScript が動いたページだけで、ASN や生の UA、IP といった1件ずつの中身は出ません。同じ Analytics のメニューには Account analytics も並んでいて、国別のリクエスト数はそちらに出ます。似た名前が隣にあるのも、迷う理由の1つでした。

## 設定済みなのに、HTML にビーコンが無かった

Cloudflare Web Analytics は設定済みで、すでに計測できているつもりでした。ところが実際の配信 HTML を確認すると、`beacon.min.js` も `data-cf-beacon` もありませんでした。設定画面を見て安心していましたが、ブラウザまで計測コードが届いていなかったのです。

設定していたのは、Web Analytics の sites 画面でのサイト登録でした。管理画面をあらためて開くと「Install JS Snippet」とあります。自分で貼る方式です。Pages のプロジェクト設定から有効にしたわけではないので、Cloudflare が HTML に何かを差し込んでくれる登録ではありませんでした。

貼る先も無かった。このサイトは静的な HTML ファイルを置いていません。Pages Functions のミドルウェアが Markdown を `marked` で変換し、組み立てた HTML を `Response` として返しているので、スニペットを入れるならコードの中しかありません。そこに入れていなかったので、ビーコンはどのページにも載っていませんでした。

## まず応答 HTML を確かめる

同じ構成で数字が出ないときは、設定画面より先に、実際の応答 HTML を見た方が早いです。

```sh
curl -s https://自分のサイト.example/ | grep -E 'beacon\.min\.js|data-cf-beacon'
```

ブラウザの「ページのソースを表示」で `beacon.min.js` を検索しても確認できます。何も見つからなければ、少なくとも HTML に計測コードは入っていません。DevTools の Network パネルで、`beacon.min.js` が読み込まれているかを見る方法もあります。

## Functions で生成する HTML へビーコンを追加する

スニペットは、HTML を組み立てるコードの側に入れました。

### 1. site token を受け取る変数を用意する

Pages Functions の環境変数を型に追加します。

```ts
interface Env {
  LOGS_DB: D1Database;
  ADMIN_TOKEN?: string;
  CF_WEB_ANALYTICS_TOKEN?: string;
  ASSETS: Fetcher;
}
```

### 2. 生成する HTML にスクリプトを入れる

HTML を組み立てる `buildHtmlPage()` へトークンを渡し、設定されているときだけ `</body>` の直前にスクリプトを出します。

```ts
const webAnalyticsBeacon = webAnalyticsToken
  ? `<script type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon='{"token":"${escapeHtml(webAnalyticsToken)}"}'></script>`
  : '';
```

条件付きにしたのは、ローカル開発でトークンが無いときまで計測スクリプトを出さないためです。このサイトにはトップページ、拡張子のない記事 URL、`?view` 付き Markdown という3つの HTML 応答経路がありますが、いずれも `buildHtmlPage()` を通るので、挿入処理は1か所で済みました。

### 3. `wrangler.toml` に site token を設定する

Web Analytics の JS Snippet に表示される site token を、`wrangler.toml` の `[vars]` に設定しました。

```toml
[vars]
CF_WEB_ANALYTICS_TOKEN = "Web Analytics の site token"
```

この site token はブラウザへ配信される公開識別子です。D1 の管理や認証に使う秘密情報ではありません。それでも、用途の違う `ADMIN_TOKEN` と同じ感覚で扱わないよう、変数名を分けています。

変数を作っただけでは、まだ何も計測されません。`CF_WEB_ANALYTICS_TOKEN` という名前を Cloudflare が自動で読むわけではないからです。Functions のコードで値を読み、`data-cf-beacon` の `token` として HTML に書き出したところで、ようやく使われます。

### 4. 配信後の HTML をもう一度確認する

設定後は、最初と同じ方法で実際の応答を確認します。

```sh
curl -s https://自分のサイト.example/ | grep -E 'beacon\.min\.js|data-cf-beacon'
```

今度はビーコンの `<script>` が返れば、少なくとも計測コードがブラウザまで届く状態です。そのうえで DevTools の Network パネルを開き、スクリプトの取得やビーコン送信がブロックされていないかを確認します。Web Analytics の数字が出るかだけを待つより、「HTML にあるか」「読み込まれたか」「送信されたか」の順で切り分けた方が、どこで止まっているか分かります。

このサイトでは、サイトを登録してから半日ほどで、一覧にページビュー1件、訪問1件が出ました。少なくとも1回は、ビーコンが最後まで動いたことになります。

## これで比べられるようになったもの

数字が2種類になりました。

- D1 のアクセスログ：Functions を通ったリクエスト
- Web Analytics：ビーコンの JavaScript が実行され、Cloudflare へ送信されたページビュー

ビーコンが発火したから人間、とまでは言えません。JavaScript を実行するヘッドレスブラウザもいるからです。

それでも、これまでは比べる相手の Web Analytics 自体が動いていませんでした。サーバーに届いただけのアクセスと、ページを描画して JavaScript まで動かしたアクセスを、ようやく並べられます。次に見るのは、同じ期間・同じ URL で D1 と Web Analytics の件数がどこまで離れるかです。
