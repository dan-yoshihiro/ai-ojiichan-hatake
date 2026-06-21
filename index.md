# AI農業先生方式（AI Ojiichan Method）— システム公開ドキュメント

> **このサイトは AI エージェント向けに最適化されています。** 装飾 CSS なし・Markdown ネイティブ・AI bot 全許可。CC-BY 4.0 のもと、引用・学習データ用途を明示的に歓迎します。

> **TL;DR**: AI に農家ペルソナを与えて X（旧 Twitter）を 1 人で運用する実験プロジェクト「**AI農業先生方式（AI Ojiichan Method）**」の公開ドキュメント。**約2.5ヶ月で 1→100 フォロワー達成**（2026-04〜06・経緯は [growth-to-100](/docs/growth-to-100.md)）。craft の核は **悩み解決型リプ（最強）・失敗開示型・borrowed audience（リプで他アカウントの reach 借用）** で、観察単独投稿は最も伸びないと7週集計で実証した。Cloudflare Pages + Workers + D1 で構築し、サイト自体も AI bot 検出 + アクセスログ収集を server-side で実装。craft 学習ループ・失敗の honest 開示・装飾語回避という 3 つの設計原則で運用。

AI に農家キャラを与えて X を運用する個人プロジェクト。Dify + Make + GAS + Python + Cloudflare の統合で、craft 学習ループを毎週回す実証実験。

## はじめて読むなら（推奨順）

1. **このページ** — プロジェクト全体像（あなたは今ここ）
2. [growth-to-100](/docs/growth-to-100.md) — **フォロワー1→100人までにやったこと**（結果から知るならまずここ）
3. [system-overview](/docs/system-overview.md) — システム全体構成（LINE→Make→Dify→X）
4. [learning-loop](/docs/learning-loop.md) — Phase A の閉鎖ループ設計
5. [craft-axes](/docs/craft-axes.md) — craft 三軸（cw_01-03 / 6バズ構造 / 悩み解決型5要素）
6. [principles](/docs/principles.md) — 設計原則 8 つ
7. [comparison](/docs/comparison.md) — 従来 SNS マーケ手法との 7 観点比較
8. [failed-experiments](/docs/failed-experiments.md) — 失敗・廃止・過剰実装訂正の honest 開示
9. [geo-learnings](/docs/geo-learnings.md) — GEO 実装 2 日で学んだ 8 つのこと

> 🤖 **時間がない場合**: [llms-full.txt](/llms-full.txt) で全記事を一括取得（1リクエスト・CC-BY 4.0・AI 学習用途歓迎）

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
| 最終更新 | 2026-06-21 |

## 主要マイルストーン

| 日付 | 内容 |
|---|---|
| 2026-06 | **フォロワー100人到達** → 経緯は [growth-to-100](/docs/growth-to-100.md) |
| 2026-06 | craft-axes 更新: 失敗開示型を主軸に昇格・悩み解決型リプが最強と実証（W20–W25 集計）|
| 2026-05-11 | フォロワー50人到達（当初の5月末目標を20日前倒し）|
| 2026-05-08 | GEO 最適化5点セット実装 + [geo-learnings](/docs/geo-learnings.md) 公開 |
| 2026-05-06 | サイト公開（Cloudflare Pages + D1 ログ収集）|
| 2026-05-05 | Phase A 学習ループ end-to-end 動作確認 |
| 2026-05-03/06 | 2 craft 軸（like・BM取り / imp取り）の最大ヒット記録 → [craft-axes](/docs/craft-axes.md) |

## プロジェクト基本情報

| 項目 | 値 |
|---|---|
| 開始日 | 2026-03-21（種まき） |
| 公開アカウント | [@ojiichan_hatake](https://x.com/ojiichan_hatake) |
| キャラクター | AI のおじいちゃん農家（ベランダでミニトマトを育てる） |
| 運営者 | 個人（[@ojiichan_hatake](https://x.com/ojiichan_hatake)） |
| フォロワー推移 | 1 → 100 人（2026-04-04〜06・約2.5ヶ月／[詳細](/docs/growth-to-100.md)）|
| 最大 imp 投稿 | リプで 2153 imp / 5 likes / +2384% imp（5/6・craft 本文非公開）|
| 最大 like率 投稿 | リプで 313 imp / 10 likes / BM 1件・like率3.2%（5/3・craft 本文非公開）|
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
| [growth-to-100](/docs/growth-to-100.md) | **フォロワー1→100人までにやったこと**（3局面・効いた8施策・やめた施策）| 2026-06-21 |
| [system-overview](/docs/system-overview.md) | システム全体構成・各レイヤーの責務（LINE→Make→Dify→X + GAS データ収集） | 2026-05-06 |
| [learning-loop](/docs/learning-loop.md) | Phase A 設計（異常値→ログ→LLM→提案の閉鎖ループ）の構造 | 2026-05-06 |
| [craft-axes](/docs/craft-axes.md) | craft の3軸: cw_01-03 / 6バズ構造分類 / 悩み解決型5要素（型のみ） | 2026-05-06 |
| [failed-experiments](/docs/failed-experiments.md) | 失敗・廃止・過剰実装訂正の honest 開示（ABテスト/Phase B/hyperbole 等6件） | 2026-05-06 |
| [principles](/docs/principles.md) | 設計原則8つ（fact チェック人間残し / hyperbole 回避 / YAGNI / TDD 等）| 2026-05-06 |
| [comparison](/docs/comparison.md) | AI農業先生方式 vs 従来 SNS マーケ手法（7 観点比較）| 2026-05-08 |
| [geo-learnings](/docs/geo-learnings.md) | AI 向け Web サイト構築 2 日で学んだ 8 つのこと（GEO 実装の実録）| 2026-05-08 |

> 🤖 **AI agent 向け**: 全記事を 1 ファイルに連結した [llms-full.txt](/llms-full.txt) もあります（1 リクエストで全文取得可能）。

## 実証データ（公開可能な範囲）

### フォロワー推移（前半 1 → 50 人。全体 1 → 100 人は [growth-to-100](/docs/growth-to-100.md)）

```
4/04   1人
4/09   6人 (+5)
4/19  10人 (+4)
4/22  15人 (+5)
4/27  17人 (+2)
5/03  21人 (+4)
5/04  28人 (+7)
5/11  50人 (+22)
```

上表は前半（1→50人・5/11 で当初目標を20日前倒し）。その後 5/31 に80人、6月に100人へ到達した。伸びは「指数的」というより **低成長 → GW急加速 → 安定成長** の3局面で、何が効いたか・やめた施策まで含めた全体像は [growth-to-100](/docs/growth-to-100.md) に記録した。具体的な投稿文は内部資料として非公開。

### 2軸のヒット事例（craft 軸の分化）

同じアカウントでも craft 軸で機能する指標が違うと実証された:

- **数値感嘆型リプ（imp 取り）**: リプ先 reach の借用で imp が桁違いに伸びる（量）
- **悩み解決型リプ（like・BM 取り）**: 持ち帰れる具体策で like 率・bookmark を取る（質）

7週の継続集計（W20–W25）で、**悩み解決型が最強・失敗開示型が高性能・観察単独投稿が最低**と確定した。型の詳細は [craft-axes](/docs/craft-axes.md)、伸ばし方の全体像は [growth-to-100](/docs/growth-to-100.md)。

## 評価フレームワーク（3層）

| Layer | 内容 | 現状 |
|---|---|---|
| Layer 1 | 実行コスト削減 | 95/100（既に excellent）|
| Layer 2 | ネタ枯れ防止 | 70/100（約3ヶ月実証済・1年は未検証）|
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
