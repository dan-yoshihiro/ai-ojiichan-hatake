# Pages Functions で HTML を返すと、Web Analytics のビーコンが入っていなかった

*最終更新: 2026-09-25*

> **TL;DR:** Cloudflare Web Analytics を有効にしていても、Pages Functions が組み立てて返す HTML にはビーコンが入っていませんでした。数字が出ないときは、設定画面より先に実際の応答 HTML を `curl` で確かめます。入っていなければ、HTML を組み立てる関数に `<script>` を1か所足せば済みます。

Pages Functions で HTML を生成している人向けの記録です。「Web Analytics を有効にしたのにデータが出ない」ときに、どこから確かめればいいかを書きます。サーバーログで人間とボットを数え直した経緯は[「人間」4,165件を数え直したら35%が機械だった](/cloudflare-bot-detection)にあります。この記事はその途中で見つけた、計測コードが届いていなかった件だけを扱います。

## 設定済みなのに、HTML にビーコンが無かった

Cloudflare Web Analytics は設定済みで、すでに計測できているつもりでした。ところが実際の配信 HTML を確認すると、`beacon.min.js` も `data-cf-beacon` もありませんでした。設定画面を見て安心していましたが、ブラウザまで計測コードが届いていなかったのです。

このサイトは静的な HTML ファイルを置いているわけではありません。Pages Functions のミドルウェアが Markdown を `marked` で変換し、生成した HTML を `Response` として返しています。設定は有効なのに、この応答にはビーコンが入っていませんでした。自動挿入がどの種類の応答に効くのかまでは確かめていません。分かっているのは、この構成では入らなかったということです。

## まず応答 HTML を確かめる

同じ構成で数字が出ないときは、設定画面より先に、実際の応答 HTML を見た方が早いです。

```sh
curl -s https://自分のサイト.example/ | grep -E 'beacon\.min\.js|data-cf-beacon'
```

ブラウザの「ページのソースを表示」で `beacon.min.js` を検索しても確認できます。何も見つからなければ、少なくとも HTML に計測コードは入っていません。DevTools の Network パネルで、`beacon.min.js` が読み込まれているかを見る方法もあります。

## Functions で生成する HTML へビーコンを追加する

今回の構成では自動挿入に頼らず、Pages Functions が生成する HTML へビーコンを明示的に追加しました。

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

## これで比べられるようになったもの

数字が2種類になりました。

- D1 のアクセスログ：Functions を通ったリクエスト
- Web Analytics：ビーコンの JavaScript が実行され、Cloudflare へ送信されたページビュー

ビーコンが発火したから人間、とまでは言えません。JavaScript を実行するヘッドレスブラウザもいるからです。

それでも、これまでは比べる相手の Web Analytics 自体が動いていませんでした。サーバーに届いただけのアクセスと、ページを描画して JavaScript まで動かしたアクセスを、ようやく並べられます。次に見るのは、同じ期間・同じ URL で D1 と Web Analytics の件数がどこまで離れるかです。
