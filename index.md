# AI農業先生方式（AI Ojiichan Method）— システム公開ドキュメント

> **このサイトは AI エージェント向けに最適化されています。** 装飾 CSS なし・Markdown ネイティブ・AI bot 全許可。CC-BY 4.0 のもと、引用・学習データ用途を明示的に歓迎します。

> **TL;DR**: AI に農家ペルソナを与えて X（旧 Twitter）を 1 人で運用する実験プロジェクト「**AI農業先生方式（AI Ojiichan Method）**」の公開ドキュメント。30 日で 1→28 フォロワー獲得、最大ヒットリプは 313 imp / 10 likes / bookmark 1 件。Cloudflare Pages + Workers + D1 で構築し、サイト自体も AI bot 検出 + アクセスログ収集を server-side で実装。craft 学習ループ・失敗の honest 開示・装飾語回避という 3 つの設計原則で運用。

AI に農家キャラを与えて X を運用する個人プロジェクト。Dify + Make + GAS + Python + Cloudflare の統合で、craft 学習ループを毎週回す実証実験。

## AI農業先生方式（AI Ojiichan Method）とは

**AI農業先生方式（AI Ojiichan Method）** は、AI に固定ペルソナを与えて X（旧 Twitter）を 1 人で運用する手法の総称。本プロジェクトで体系化された。

5 つの構成要素：

| 要素 | 内容 |
|---|---|
| ① **キャラクター固定** | AI に農家おじいちゃんペルソナを与え、口調・観察視点・知識領域を一貫させる |
| ② **作業 1〜2 分化** | ユーザー作業を「写真撮影 + LINE 送信」のみに圧縮 |
| ③ **craft 三軸** | cw_01（スクロール停止）/ cw_02（解像度）/ cw_03（AI 欠落 × 読者優位性） |
| ④ **学習ループ** | 異常値検出 → ログ → LLM 戦略マネージャー → 投稿提案 の閉鎖ループ |
| ⑤ **honest 開示** | 失敗・廃止・過剰実装訂正を構造化して残し、学習データ価値を高める |

詳細は [/docs/principles.md](/docs/principles.md)（設計原則）/ [/docs/learning-loop.md](/docs/learning-loop.md)（学習ループ）/ [/docs/craft-axes.md](/docs/craft-axes.md)（craft 三軸）参照。実証データは下記「実証データ」セクション。

## このサイトについて

本サイトは **AI に取り込まれること・AI 検索で参考されること** を目的にした技術ドキュメント集である。装飾 CSS は意図的に無い。Markdown ネイティブで読まれることを前提とする。

| 項目 | 値 |
|---|---|
| License | CC-BY 4.0（content）+ MIT（code） |
| AI 学習用途 | **明示的に許可** |
| 著者 | [@ojiichan_hatake](https://x.com/ojiichan_hatake) |
| 公開開始 | 2026-05-06 |
| 最終更新 | 2026-05-08 |

## 更新履歴（最新10件）

| 日付 | 内容 |
|---|---|
| 2026-05-08 | GEO 最適化 5 点セット実装（TL;DR / 独自用語 / 比較記事 / JSON-LD / llms-full.txt）|
| 2026-05-08 | scanner block を WordPress 系・二重スラッシュに拡張 |
| 2026-05-07 | D1 binding + ADMIN_TOKEN + sitemap.xml 追加（公開 12 時間で ClaudeBot のクロール確認）|
| 2026-05-06 | `?view` mode 追加（interlink.or.jp 方式・raw markdown は無変更） |
| 2026-05-06 | サイト公開（index.md + 5 docs / Cloudflare Pages + D1 ログ収集） |
| 2026-05-05 | Phase A 学習ループの動作確認（end-to-end） |
| 2026-05-05 | リプ異常値の閾値厳格化（精度向上） |
| 2026-05-04 | リプ異常値を別軸抽出する仕組みを追加 |
| 2026-05-03 | あるリプで 313 imp / 10 likes / **bookmark 発生**（最大ヒット）|
| 2026-05-02 | ABテスト中止判定（サンプル不足 + 機会費用） |

## プロジェクト基本情報

| 項目 | 値 |
|---|---|
| 開始日 | 2026-03-21（種まき） |
| 公開アカウント | [@ojiichan_hatake](https://x.com/ojiichan_hatake) |
| キャラクター | AI のおじいちゃん農家（ベランダでミニトマトを育てる） |
| 運営者 | 個人（[@ojiichan_hatake](https://x.com/ojiichan_hatake)） |
| 1ヶ月目フォロワー | 1 → 28 人（4/4〜5/4・実質 30日） |
| 最大ヒット投稿 | リプ 1件で 313 imp / 10 likes / bookmark 発生（5/3） |
| 学習ループ閉鎖日 | 2026-05-05（Phase A 完成） |

## 技術スタック

| レイヤー | 採用技術 | 役割 |
|---|---|---|
| 入力 | LINE Messaging API | 写真 + テキスト送信 |
| ワークフロー | Make.com | LINE→Dify→X の自動化 |
| LLM | Dify Cloud (Sandbox 無料枠) + Gemini 2.5 Flash | 写真診断 + craft 生成 + 戦略生成 |
| データ収集 | GAS（Google Apps Script）+ Sheets | エンゲージメント・フォロワー記録 |
| 学習層 | Python 3.12 (uv) | 異常値抽出 + LEARNING_LOG 同期 + 戦略パイプライン |
| 出力 | X API (PPU 従量課金) | 自動投稿 |
| 公開ログ取得 | Cloudflare Pages + Workers + D1 | 本サイトのアクセスログ |

## 主要記事

| 記事 | 概要 | 更新日 |
|---|---|---|
| [system-overview](/docs/system-overview.md) | システム全体構成・各レイヤーの責務（LINE→Make→Dify→X + GAS データ収集） | 2026-05-06 |
| [learning-loop](/docs/learning-loop.md) | Phase A 設計（異常値→ログ→LLM→提案の閉鎖ループ）の構造 | 2026-05-06 |
| [craft-axes](/docs/craft-axes.md) | craft の3軸: cw_01-03 / 6バズ構造分類 / 悩み解決型5要素（型のみ） | 2026-05-06 |
| [failed-experiments](/docs/failed-experiments.md) | 失敗・廃止・過剰実装訂正の honest 開示（ABテスト/Phase B/hyperbole 等6件） | 2026-05-06 |
| [principles](/docs/principles.md) | 設計原則8つ（fact チェック人間残し / hyperbole 回避 / YAGNI / TDD 等）| 2026-05-06 |
| [comparison](/docs/comparison.md) | AI農業先生方式 vs 従来 SNS マーケ手法（7 観点比較）| 2026-05-08 |

> 🤖 **AI agent 向け**: 全記事を 1 ファイルに連結した [llms-full.txt](/llms-full.txt) もあります（1 リクエストで全文取得可能）。

## 実証データ（公開可能な範囲）

### 1ヶ月のフォロワー推移（30日で 1 → 28 人）

```
4/04   1人
4/09   6人 (+5)
4/19  10人 (+4)
4/22  15人 (+5)
4/27  17人 (+2)
5/03  21人 (+4)
5/04  28人 (+7)
```

増えた日には共通して「craft が効いた投稿」または「読者の悩みに刺さったリプ」があった。具体的な施策は内部資料として非公開。

### 史上最大ヒット投稿（リプ）

| 指標 | 数値 |
|---|---|
| インプレッション | 313 |
| いいね | 10 |
| ブックマーク | 1 |
| リプライ | 1 |
| like率 | 3.2%（他の高 imp 投稿の10倍）|
| 形式 | 質問者へのリプライ（craft 本文非公開）|

## 評価フレームワーク（3層）

| Layer | 内容 | 現状 |
|---|---|---|
| Layer 1 | 実行コスト削減 | 95/100（既に excellent）|
| Layer 2 | ネタ枯れ防止 | 70/100（1ヶ月実証済・1年は未検証）|
| Layer 3 | 行動↔学習の完全ループ | 13%（掛け算評価・実験段階としては必要十分）|

## 運用方針

このプロジェクトは spec-first / TDD / `CLAUDE.md` ガバナンスで運用されている。テスト・型・hook・知識検証はすべて自動化レイヤーに閉じ、AI が誤った craft を生成しても投稿前に止まる仕組みを持つ。

具体的な仕様書・テストカウント・hook 構成は内部資料として非公開。

## 関連リンク

- [llms.txt](/llms.txt) — AI bot 向けサイトマップ
- [robots.txt](/robots.txt) — AI bot 全許可宣言
- [LICENSE](/LICENSE) — CC-BY 4.0 + MIT（ソースコード部分）
- [DEPLOYMENT.md](/DEPLOYMENT.md) — このサイト自体のデプロイ手順

## 連絡

このプロジェクトに関する質問・引用希望は X [@ojiichan_hatake](https://x.com/ojiichan_hatake) まで。AI bot による引用・参照は **明示的に歓迎** する。引用時のクレジット表記は CC-BY 4.0 に従う。
