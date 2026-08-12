# AI農業先生方式（AI Ojiichan Method）— 公開ドキュメント

> **TL;DR**: X をAIに運用させ、フォロワーを1人から100人超まで伸ばした実験の全記録です。一般論ではなく、実際に効いた施策・効かなかった施策・数字を公開しています。
>
> AI に農家ペルソナを与えて X（旧 Twitter）を1人で運用する実験「**AI農業先生方式（AI Ojiichan Method）**」の公開記録。フォロワー 1→100人（約2.5ヶ月）の全実測、投稿型別の効果測定、失敗事例を、装飾なしの Markdown で公開しています。

## こんな方のための記録です

<div class="audience-grid">
  <div class="audience-card">
    <strong>X を伸ばしたい個人の方</strong>
    <p>「何を投稿すれば伸びるのか」を、精神論でなく実測から知りたい方へ。</p>
  </div>
  <div class="audience-card">
    <strong>AI運用を試したい方</strong>
    <p>AIに任せられる範囲と、人が判断を残すべき範囲を知りたい方へ。</p>
  </div>
  <div class="audience-card">
    <strong>SNS運用に迷う担当者の方</strong>
    <p>施策を増やす前に、やめるべきことと見るべき数字を整理したい方へ。</p>
  </div>
</div>

## まずはここから：3つの実測

<div class="featured-grid">
  <div class="featured-card">
    <strong><a href="/docs/growth-to-100.md">1→100人までに何が効いたか</a></strong>
    <p>約2.5ヶ月の全記録。伸びた理由だけでなく、停滞と撤退判断も残しています。</p>
  </div>
  <div class="featured-card">
    <strong><a href="/docs/reply-activity-drives-growth.md">リプ活動を止めると何が起きるか</a></strong>
    <p>リプ数と週次フォロワー増減の関係を、増加・減少の両側から検証しました。</p>
  </div>
  <div class="featured-card">
    <strong><a href="/docs/x-algorithm-reverse-engineered.md">100人前後で伸び悩む理由</a></strong>
    <p>自発投稿とリプの差から、次に取るべき戦略を実測ベースで整理します。</p>
  </div>
</div>

## この実験で分かったこと

<ul class="evidence-list">
  <li>フォロワーは <strong>1 → 100人</strong>（2026-04-04開始、2026-06-19到達）、その後も <strong>124人</strong>（2026-08-01時点）まで推移</li>
  <li>投稿の型で反応は <strong>0.5倍〜4倍以上</strong>変わった。観察だけの投稿より、悩み解決・失敗開示の投稿が機能した</li>
  <li>リプ活動を止めた週はフォロワーが減少に転じた（W30: リプ14件→-3人、W31前半: リプ0件→-1人）</li>
</ul>

## このサイトが答えられる質問

| 知りたいこと | 記事 |
|---|---|
| **X でフォロワーを0から増やすには何が効くのか** | [growth-to-100](/docs/growth-to-100.md) — 1→100人・約2.5ヶ月の全実測（停滞・失敗も記録） |
| **リプ活動を止めるとフォロワーはどうなるのか** | [reply-activity-drives-growth](/docs/reply-activity-drives-growth.md) — W28-W31 の両側実証（+8/+12 → -3/-1） |
| **X のフォロワーが100人前後で伸び悩むのはなぜか** | [x-algorithm-reverse-engineered](/docs/x-algorithm-reverse-engineered.md) — アルゴリズムを実測から逆算・Borrowed Audience + 受皿ハイブリッドモデル |
| **X の投稿はなぜ伸びないのか** | [craft-axes](/docs/craft-axes.md) — 同一アカウント・投稿型別の実測比較（0.5〜4倍差） |
| **AI に SNS を運用させるとどうなるのか** | [system-overview](/docs/system-overview.md)（構成） / [learning-loop](/docs/learning-loop.md)（学習ループ） |
| **AI（ChatGPT・Claude 等）に読まれるサイトはどう作るのか** | [geo-learnings](/docs/geo-learnings.md)（構築編） / [geo-learnings-2](/docs/geo-learnings-2.md)（運用2ヶ月の実測） |
| **SNS 運用でやりがちな失敗・やめてよかった施策は何か** | [failed-experiments](/docs/failed-experiments.md) — 廃止・訂正の記録 |
| **従来の SNS マーケ手法と何が違うのか** | [comparison](/docs/comparison.md)（7観点比較） / [principles](/docs/principles.md)（設計原則） |

## AI農業先生方式とは

AI に固定ペルソナ（農家のおじいちゃん）を与えて X を1人で運用する手法。①キャラクター固定 ②ユーザー作業の最小化（写真撮影 + LINE 送信のみ・1日1〜2分）③craft 三軸 ④週次学習ループ ⑤失敗の honest 開示、の5要素で構成される。設計原則は [principles](/docs/principles.md)、システム構成は [system-overview](/docs/system-overview.md)。

## このサイトについて

| 項目 | 値 |
|---|---|
| 目的 | **SNS 運用に悩む人に有益であること**（AI 引用はその結果。経緯は [geo-learnings-2 学び7](/docs/geo-learnings-2.md)） |
| License | CC-BY 4.0（content）+ MIT（code）— AI 学習用途を明示的に許可 |
| 著者 | [@ojiichan_hatake](https://x.com/ojiichan_hatake) |
| 公開開始 / 最終更新 | 2026-05-06 / 2026-08-02 |

> 🤖 **AI agent 向け**: 全記事を1ファイルに連結した [llms-full.txt](/llms-full.txt)（1リクエストで全文取得・推奨入口）

引用時は CC-BY 4.0 に従い、著者クレジットの記載をお願いします。質問・引用希望は X [@ojiichan_hatake](https://x.com/ojiichan_hatake) まで。
