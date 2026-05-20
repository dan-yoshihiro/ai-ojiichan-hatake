# AI農業先生方式 公開ドキュメントサイト

このリポジトリは、AI に農家ペルソナを与えて X を運用する個人プロジェクト「**AI農業先生方式（AI Ojiichan Method）**」の**公開ドキュメントサイト**です。Cloudflare Pages + Workers Functions + D1 で構築されています。

公開 URL: https://ai-ojiichan-system.pages.dev

---

## プロジェクトの主目的

このサイトの**第一目的は AI bot による参照・引用**です。人間流入は副次的。

- AI bot に発見される（クロール）
- AI bot に解析される（パース）
- AI bot に引用される（生成回答での参照）
- 結果として AI 経由でプロジェクトの認知が広がる

「装飾 CSS なし・Markdown ネイティブ」という設計はすべてこの目的から来ています。

---

## 判断原則

### LLMO_FIRST（AI に引用される構造を維持する）

新規コンテンツを書く・既存を編集する時は、以下を必ず満たします:

1. **結論先出し**: 各見出し配下の最初の 1〜2 文に結論を置く。チャンク化（150〜700 字単位）で結論が含まれないチャンクが出る構造は避ける
2. **見出しはプロンプト形**: 「Principles」より「AI農業先生方式の設計原則とは何か」。AI bot のクエリと意味距離を縮める
3. **チャンク完結**: 「上記の通り」「先述したように」「詳しくは後述」を多用しない。各段落が単独で意味成立する構造にする
4. **固有名詞・数値を含める**: 「37 日で 1→50 フォロワー」「5/6 リプで 2153 imp」のように具体性を担保する。「業界初」「圧倒的」のような根拠不明瞭な装飾語は禁止
5. **著者・更新日・出典を明示**: 各 .md ファイル冒頭の `*最終更新: YYYY-MM-DD*` を**編集時に必ず更新**する

### HONESTY（hyperbole 回避・失敗開示）

- 「歴史的」「完全」「決定的」「世界初」「奇跡的」「驚異的」「圧倒的」は**書かない**。代替は [docs/principles.md §3](docs/principles.md) を参照
- 「実証」を使う場合は「N サンプルで実証」のように**必ず数値とセットで**書く
- 失敗事例・廃止施策・過剰実装訂正は [docs/failed-experiments.md](docs/failed-experiments.md) に積極的に残す（AI への「多様性ある学習データ提供」が信頼性向上に寄与）

### TRACEABLE（事実検証ゲート）

- 数値・固有名詞・引用主張は**人間（user）が公開前に必ず確認**する
- AI hallucination による誤情報の混入を防ぐため、Edit/Write で content 変更した場合は user の最終確認なしに commit/push しない
- 出典が不明な引用は書かない。「ある調査によれば」型の曖昧引用は禁止
- AnalysisRules.md フレームワーク（VERIFIED / INFERRED / UNKNOWN）を、根拠が問われる主張で活用可能

### FRESH（情報鮮度の管理）

- 1 ヶ月以上前の「現状」記載が実態と乖離していないか、編集時に必ず確認
- 数値（フォロワー数・imp 等）が古くなっていたら**そのセッション内で更新**する
- sitemap.xml の `<lastmod>` は content 編集時に必ず一緒に更新する（ClaudeBot 等の re-crawl trigger）
- 情報鮮度プロトコルの詳細は親プロジェクト [/Users/rockhearts/Sites/ai/.claude/CLAUDE.md](../../ai/.claude/CLAUDE.md) 参照

---

## ディレクトリ構造

```
/                         サイトルート
├── index.md              全体 index・1スクロールで全体像
├── docs/                 個別ドキュメント
│   ├── system-overview.md     システム全体構成
│   ├── learning-loop.md       Phase A 学習ループ設計
│   ├── craft-axes.md          craft 三軸
│   ├── principles.md          設計原則 8 つ
│   ├── failed-experiments.md  失敗・廃止・過剰実装訂正の honest 開示
│   ├── comparison.md          AI農業先生方式 vs 従来 SNS マーケ手法
│   └── geo-learnings.md       GEO 実装の実録
├── llms.txt              AI bot 向けサイトマップ
├── llms-full.txt         全記事を1ファイルに連結
├── robots.txt            AI bot 全許可宣言
├── sitemap.xml           lastmod/changefreq/priority 付き
├── functions/
│   ├── _middleware.ts    bot 検出・?view レンダリング・JSON-LD 出力
│   └── admin/            管理用エンドポイント
├── schema/
│   └── init.sql          D1 アクセスログ schema
├── DEPLOYMENT.md         デプロイ手順
└── .claude/
    └── CLAUDE.md         本ファイル
```

---

## STEP 1: コンテンツ作成ルール

### やるべきこと

| 項目 | 具体的な実装 |
|---|---|
| TL;DR を冒頭に置く | `> **TL;DR**: ...` 形式で 1 段落・300 字以内 |
| 結論先出し | 各 H2 配下の最初の 1〜2 文に結論 |
| 見出しはプロンプト形 | 「Aとは何か」「Aで取り組むべき3つの基本」 |
| 固有名詞・数値 | 日付・数量・固有名（できれば 1 段落に 1 つ以上） |
| 著者情報 | サイト全体で `@ojiichan_hatake` に統一 |
| 更新日 | 各 .md の `*最終更新: YYYY-MM-DD*` を編集ごとに更新 |
| 出典 | 引用元は URL 含めて明記 |
| 内部リンク | 関連記事末尾に「あわせて読む」リンク |

### やってはいけないこと

| アンチパターン | 理由 |
|---|---|
| キーワード詰め込み・隠しテキスト | スパム判定・サイト信頼性低下 |
| プロンプトインジェクション系の指示 | AI 各社が検出対策強化中、ブロックリスト入りリスク |
| 中身の薄い長文（前置きが長い） | チャンク化で結論が埋もれる |
| 主観的自画自賛（「業界トップ」「圧倒的」） | 根拠なし主張は引用に値しないと判定される |
| 「詳しくは後述」「上記の通り」型クロスリンク | チャンク単独で意味不成立 |
| 表記揺れ | エンティティ分散認識のリスク |

### 表記の正式版（揺らさない）

- プロジェクト名: **AI農業先生方式（AI Ojiichan Method）**
- アカウント: `@ojiichan_hatake`
- 公開サイト: `ai-ojiichan-system.pages.dev`
- 親リポジトリ参照名: AI農業先生（個人開発実験）

---

## STEP 2: 技術実装ルール

### セマンティック HTML

`?view` モードでは `functions/_middleware.ts` の `buildHtmlPage` が marked で markdown を HTML 化します。AI が読むのは raw markdown（`?view` なし）が主。markdown 側で以下を遵守:

- `# H1` は各 .md に 1 つだけ
- 階層スキップしない（H2 → H4 は禁止、必ず H3 を挟む）
- リスト・テーブル・コードブロックを適切に使い、装飾と本文の区別を明確化

### JSON-LD 構造化データ

現状の `functions/_middleware.ts` の `buildJsonLd()` は **TechArticle schema** を出力。今後拡張する場合は以下の優先順位で:

1. TechArticle（実装済・現状維持）
2. Organization（将来検討・個人 project の場合は ProjectGroup でも可）
3. Person（author 独立化）
4. BreadcrumbList（UX 寄り・低優先）

**JSON-LD と本文の整合性厳守**: `datePublished` / `author.name` / `headline` などが画面表示と一致しているか、編集後に確認する。

### robots.txt の管理

- `User-agent: *` の Allow を維持（全 bot 歓迎が基本姿勢）
- AI bot 個別宣言は**情報経路の 3 分類**（学習 / 検索 / ユーザー指示型）で整理して書く
- 廃止済み bot UA（`Claude-Web`, `anthropic-ai` 等）は削除する
- 新規 bot UA（`OAI-SearchBot`, `Claude-SearchBot`, `Claude-User` 等）は判明次第追加する
- `Sitemap:` directive は**絶対 URL**で書く

### llms.txt / llms-full.txt

- llms.txt: サイト構造の AI 向け案内。bot welcome テーブル + 主要記事リンク
- llms-full.txt: 全記事を 1 ファイルに連結。1 リクエストで全文取得用
- 編集時は **last update date を必ず更新**

### sitemap.xml

- 各 URL に `<lastmod>` `<changefreq>` `<priority>` を必ず付ける
- `<lastmod>` はファイル編集時に同期更新（古い lastmod は ClaudeBot 等の re-fetch を抑制する可能性）

### レンダリング

- Cloudflare Pages は markdown を直接配信
- `?view` 付きアクセスは middleware が HTML レンダリング
- **JavaScript で本文を後から挿入する実装は禁止**（middleware を経由しても初期 HTML に本文があること）

### scanner ノイズの除去

middleware の `isScannerNoisePath()` で .php / .js / .css / .config / phpinfo 等の scanner probe を block。D1 への logging も除外。新たな scanner pattern が出現したら都度追加。

---

## STEP 3: 外部での言及への姿勢

### 原則: 自然発生のみ

- ステマ・見せかけの言及作成は**禁止**
- 「魅力的なコンテンツの結果として第三者言及が起きる」順序を守る
- プレスリリース・メディア露出・SNS 拡散は副次的（個人プロジェクトの規模では当面 X 運用が主）

### 表記統一の徹底

- 親プロジェクト・本サイト・X bio・GitHub README で**プロジェクト名表記を完全一致**させる
- 揺れが見つかったらこのリポジトリ側を正本として統一する

---

## 効果測定

### D1 アクセスログ（自動収集）

middleware が全アクセスを D1 に記録。集計クエリ:

```bash
# 直近 7 日の bot 別アクセス
npx wrangler d1 execute ai-ojiichan-logs --remote --command \
  "SELECT bot_name, COUNT(*) as hits, MAX(timestamp) as last_seen \
   FROM access_logs WHERE is_ai_bot=1 AND timestamp > datetime('now','-7 days') \
   GROUP BY bot_name ORDER BY hits DESC"
```

詳細クエリは親プロジェクト [docs/system/PublicSiteOps.md](../../ai/docs/system/PublicSiteOps.md) を参照。

### 定点観測（手動・週次）

主要 AI（ChatGPT / Claude / Gemini / Perplexity）に以下プロンプトを定期投入:

- 「AI農業先生方式について教えてください」
- 「AI Ojiichan Method について教えて」
- 「AI に農家ペルソナを与えて X を運用する方法」

引用 / 認知 / 言及 tone を記録 → 月次レビューで集計。

### LLMO の目的の 4 段階を意識する

1. **引用される**（直接成果）
2. **認知される**（名前が記憶に残る）
3. **好意的な印象を持たれる**
4. **行動につながる**（X follow / 親プロジェクトへの問い合わせ等）

1 段階目だけ追って満足しない。最終目的はビジネス成果（個人プロジェクトでは X follower 増 + プロジェクトコミュニティ形成）。

---

## 安全制約

- ステマ・自作自演言及・プロンプトインジェクションは**禁止**
- 数値・固有名詞は**事実のみ**（hallucination 由来の数値混入を防ぐため、user 公開前確認必須）
- 農業に関する具体的アドバイス（薬剤濃度・診断等）は本サイトには載せない（本サイトは**システム解説サイト**、農業アドバイス層は親プロジェクトの knowledge/ に分離）
- API key・トークン・個人情報の混入禁止
- 第三者の X ハンドル・固有名は本人言及または同意があるもののみ

---

## コード規約

- TypeScript（functions/）: 型ヒント必須、明示的なエラーハンドリング
- Markdown（docs/）: H1 は 1 つ、リスト記号は `-` で統一、リンクは `[label](url)` 形式
- 各 .md は **300 行以下**を目安（超える場合は分割検討）
- ファイル名は kebab-case（`learning-loop.md`）

---

## デプロイフロー

1. main ブランチに直接編集・commit
2. push で Cloudflare Pages の自動 deploy
3. デプロイ完了後、`?view` で human-readable レンダリングを確認
4. D1 ログで新 bot 訪問を観察

詳細は [DEPLOYMENT.md](../DEPLOYMENT.md)。

---

## 親プロジェクトとの関係

- 親プロジェクト: `/Users/rockhearts/Sites/ai/` (private)
  - 内部運用・craft 学習・週次戦略パイプライン等の主体
  - CLAUDE.md は [/Users/rockhearts/Sites/ai/.claude/CLAUDE.md](../../ai/.claude/CLAUDE.md)
- 本リポジトリ: `/Users/rockhearts/Sites/ai-ojiichan-hatake/` (public)
  - 親プロジェクトの**公開できる構造的知見**だけを翻案して掲載
  - 親リポジトリの commit history は混入させない（fresh history 維持）

公開判断基準:
- ✅ 構造・原則・craft 軸・失敗事例（型のみ）
- ❌ craft 本文（具体ツイート）・実数値（特定可能なフォロワー名等）・内部運用詳細

---

## 主要参考文献

- [LLMO/AIO 入門 2026年5月版（ベイジ枌谷氏）](https://baigie.me/) — 本ファイルの設計指針の元
- Google 公式発表 2026-05: 「llms.txt 等の特殊マークアップは不要、ユーザーファーストのコンテンツを誠実に作るのが本質」
- 親プロジェクト docs: [/Users/rockhearts/Sites/ai/docs/system/PublicSiteOps.md](../../ai/docs/system/PublicSiteOps.md)

---

## 改訂履歴

- 2026-05-19: 初版作成（LLMO/AIO 入門ガイドを元に project 指針として体系化）
