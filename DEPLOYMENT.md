# Deployment Guide

このサイトを Cloudflare Pages + Workers にデプロイする手順。

## 前提

- Cloudflare アカウント（無料枠で十分）
- GitHub アカウント
- node.js 18+ インストール済み
- `wrangler` CLI インストール（後述）

## 全体フロー

```
[ローカル public-site/]
   ↓ git push
[GitHub repo (public)]
   ↓ Cloudflare Pages auto-deploy
[Cloudflare Pages site]
   ↓ Workers Function (_middleware.ts)
   ↓ binding
[Cloudflare D1 (access_logs)]
```

## Step 1. リポジトリの公開化

このディレクトリ（`public-site/`）を GitHub の **新規 public リポジトリ** にする。

```bash
cd public-site
git init
git add .
git commit -m "initial publish: AI農業先生 system documentation"
gh repo create ai-ojiichan-system --public --source=. --push
```

または既存 ai/ リポジトリの subdirectory として残し、Cloudflare Pages の build root を `public-site/` に指定する方式でも可（こちらは運用情報の漏洩リスクに注意）。

**推奨は新規 public リポジトリ**（運用情報と公開情報を分離）。

## Step 2. wrangler CLI のインストール

```bash
npm install -g wrangler
wrangler login
```

ブラウザで Cloudflare アカウントへの認可を求められる。承認。

## Step 3. D1 データベース作成

```bash
cd public-site
wrangler d1 create ai-ojiichan-logs
```

出力例：

```
✅ Successfully created DB 'ai-ojiichan-logs'

[[d1_databases]]
binding = "LOGS_DB"
database_name = "ai-ojiichan-logs"
database_id = "abc123-def456-..."
```

この `database_id` を `wrangler.toml` の該当行に貼る：

```toml
[[d1_databases]]
binding = "LOGS_DB"
database_name = "ai-ojiichan-logs"
database_id = "ここに貼る"  # ← REPLACE_WITH_ACTUAL_D1_ID_AFTER_CREATE を置き換え
```

## Step 4. D1 schema 投入

ローカル（dev 用）と remote（本番用）の両方に schema を流す。

```bash
# ローカル開発用
wrangler d1 execute ai-ojiichan-logs --file=schema/init.sql

# 本番（Cloudflare 上）
wrangler d1 execute ai-ojiichan-logs --remote --file=schema/init.sql
```

確認：

```bash
wrangler d1 execute ai-ojiichan-logs --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

`access_logs` テーブルが見えれば OK。

## Step 4.5. npm install（marked が依存に入っているため必須）

```bash
cd public-site
npm install
```

`marked` パッケージが `?view` モードでの HTML レンダリングに使われる。

## Step 5. Cloudflare Pages にデプロイ

### 方式A: GitHub 連携（推奨）

1. https://dash.cloudflare.com/ → Workers & Pages → Create application → Pages → Connect to Git
2. 上記で作った GitHub repo を選択
3. Build settings:
   - Framework preset: **None**
   - Build command: （空欄でOK・このサイトはビルド不要）
   - Build output directory: `/`（リポジトリルート）
   - Deploy command: （空欄でOK・GitHub 連携では Wrangler deploy を実行しない）
4. Save and Deploy

`npx wrangler deploy` は Workers 用コマンドのため、この Pages プロジェクトでは使わない。Cloudflare のログに
`It looks like you've run a Workers-specific command in a Pages project` と出る場合は、dashboard の Deploy command を空欄に戻す。
`wrangler pages deploy` を Deploy command に設定すると `CLOUDFLARE_API_TOKEN` に Pages 編集権限が必要になるため、GitHub 連携では避ける。

### 方式B: wrangler から直接

```bash
wrangler pages deploy . --project-name ai-ojiichan-system
```

初回は Pages project 名を聞かれる。`ai-ojiichan-system` 推奨。

## Step 6. D1 バインディング設定

Cloudflare Pages dashboard で:

1. Workers & Pages → ai-ojiichan-system → Settings → Functions
2. **D1 database bindings** セクション
3. Add binding:
   - Variable name: `LOGS_DB`
   - D1 database: `ai-ojiichan-logs`
4. Save

これで Pages Functions から `env.LOGS_DB` 経由で D1 にアクセス可能になる。

## Step 7. 環境変数 ADMIN_TOKEN 設定

管理画面（/admin/*）の認証用トークン。

1. Workers & Pages → ai-ojiichan-system → Settings → Environment variables
2. **Production** に追加:
   - Variable name: `ADMIN_TOKEN`
   - Value: ランダムな長い文字列（例: `openssl rand -base64 32` で生成）
   - **Encrypt** にチェック（重要）
3. Save

このトークンをローカルに secure に保管。管理画面アクセス時に必要。

## Step 8. 再デプロイ

環境変数追加後、再デプロイで反映：

```bash
wrangler pages deploy .
```

または GitHub に空 commit をプッシュ（自動再デプロイ）：

```bash
git commit --allow-empty -m "redeploy with D1 binding + ADMIN_TOKEN"
git push
```

## Step 9. 動作確認

### サイト本体

```bash
# 適当な URL を叩く（XXXX を実際のサブドメインに置換）
curl -A "Mozilla/5.0" https://ai-ojiichan-system.pages.dev/                                # → /index.md に 302 redirect
curl -A "Mozilla/5.0" -L https://ai-ojiichan-system.pages.dev/                             # 追従して raw markdown 取得
curl -A "Mozilla/5.0" https://ai-ojiichan-system.pages.dev/llms.txt
curl -A "Mozilla/5.0" https://ai-ojiichan-system.pages.dev/robots.txt
curl -A "Mozilla/5.0" https://ai-ojiichan-system.pages.dev/docs/principles.md              # raw markdown
curl -A "Mozilla/5.0" "https://ai-ojiichan-system.pages.dev/docs/principles.md?view"       # human-readable HTML
```

ブラウザで `https://YOUR-SITE.pages.dev/?view` を開くと human-readable レンダリング、`?view` を外すと raw markdown が見える。

### AI bot ロギング確認

```bash
# GPTBot として叩く
curl -A "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot" \
  https://ai-ojiichan-system.pages.dev/

# ClaudeBot として叩く
curl -A "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" \
  https://ai-ojiichan-system.pages.dev/

# PerplexityBot として叩く
curl -A "Mozilla/5.0 (compatible; PerplexityBot/1.0)" \
  https://ai-ojiichan-system.pages.dev/
```

### 管理画面でログ確認

```bash
# bot 別累計
curl "https://ai-ojiichan-system.pages.dev/admin/logs?token=YOUR_TOKEN&view=bot"

# 直近7日の bot 別集計
curl "https://ai-ojiichan-system.pages.dev/admin/logs?token=YOUR_TOKEN&view=bot&days=7"

# 直近の AI bot アクセス
curl "https://ai-ojiichan-system.pages.dev/admin/logs?token=YOUR_TOKEN&view=recent&limit=20"

# scanner probe を除外した人間らしいアクセス
curl "https://ai-ojiichan-system.pages.dev/admin/logs?token=YOUR_TOKEN&view=legit-human&days=7"

# JSON 形式で
curl "https://ai-ojiichan-system.pages.dev/admin/logs?token=YOUR_TOKEN&view=daily&days=7&format=json"
```

`daily` view は `humans_or_scanners` と `legit_humans` を分けて返す。`legit_humans` は PHP 探索や `_profiler` などの既知 scanner probe を除外した値。

複雑な D1 集計は zsh の `unknown file attribute` を避けるため、SQL ファイルから実行する。

```bash
npm run d1:bot-summary
npm run d1:daily-quality
npm run d1:legit-human

# GPTBot の巡回順を見る
wrangler d1 execute ai-ojiichan-logs --remote --file=queries/gptbot-path-7d.sql
```

## Step 10. カスタムドメイン（任意）

`ai-ojiichan-system.pages.dev` の workers.dev サブドメインで運用する場合は不要。

独自ドメインを使う場合は Cloudflare Pages → Custom domains で設定。

## ローカルでの表示確認

`?view` モードや middleware の挙動を本番と同じく確認したい場合：

```bash
cd public-site
npm install         # 初回のみ
npx wrangler pages dev . --d1=LOGS_DB
```

ブラウザで `http://localhost:8788/` を開くと自動的に `/index.md` にリダイレクト → さらに `?view` を付ければレンダリング表示。

raw markdown 表示は `?view` を外すだけで切り替わる。

## トラブルシューティング

### 「LOGS_DB is undefined」エラー

→ Step 6 の D1 binding が反映されていない。dashboard で再設定 + 再デプロイ。

### ログが書き込まれない

→ `wrangler tail` でリアルタイムログを確認：

```bash
wrangler pages deployment tail
```

### 管理画面が 401

→ `ADMIN_TOKEN` 環境変数が正しく設定されているか dashboard で確認。token パラメータが URL エンコードされているか確認。

## 運用

### 日次の確認

```bash
curl "https://YOUR-SITE.pages.dev/admin/logs?token=...&view=daily&limit=7"
```

### コンテンツ更新

```bash
# ローカルで markdown を編集
git add docs/...
git commit -m "update content"
git push

# Cloudflare Pages が自動デプロイ
```

### D1 のメンテナンス

ログが溜まりすぎたら古いものを削除：

```bash
wrangler d1 execute ai-ojiichan-logs --remote \
  --command="DELETE FROM access_logs WHERE timestamp < datetime('now', '-90 days');"
```

## コスト見積もり（無料枠での運用）

| サービス | 無料枠 | 想定使用量 | コスト |
|---|---|---|---|
| Cloudflare Pages | 無制限リクエスト・500ビルド/月 | 数千リクエスト/月 | $0 |
| Cloudflare Workers | 100,000 req/日 | 1,000 req/日想定 | $0 |
| Cloudflare D1 | 5GB ストレージ・5M reads/日・100K writes/日 | 数千 writes/月 | $0 |
| **合計** | - | - | **$0/月** |

100K writes/日 = 月300万書き込みまで無料。本サイトのトラフィックなら数年は無料枠内。

## 関連

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
