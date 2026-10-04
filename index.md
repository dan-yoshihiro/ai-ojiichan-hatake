# AIにSNSの投稿をどこまで任せられるか：Xを6ヶ月自動投稿した1アカウントの実測

*最終更新: 2026-10-04 / 最新の観測週: 2026年9月28日〜10月4日（フォロワー155人）*

> **TL;DR:** 写真をLINEに送ると、AIが本文を書いてXに投稿する仕組みを作り、家庭菜園のアカウント1つで2026年4月4日から運用しています。自動にできたのは、本文を書いて出すことと、数字を集めることまででした。写真を撮って送る時間、相手の投稿へ返信しに行くこと、週に1回数字を見て次の1手を決めることは、6ヶ月ずっと人の仕事でした。費用は、生成AIが無料枠の範囲、X API が月2ドルほどです。

<ul class="stat-grid" aria-label="6ヶ月の主な数字">
  <li class="stat"><span class="stat-value">151<small> / 171日</small></span><span class="stat-label">投稿があった日。空いた日は、人が写真を送れなかった日</span></li>
  <li class="stat"><span class="stat-value">62%<small> → </small>6%</span><span class="stat-label">定型句「元気な」を含む投稿。言葉の決まりを表にして渡した前後</span></li>
  <li class="stat"><span class="stat-value">月2<small>ドルほど</small></span><span class="stat-label">X API の費用。生成AIは無料枠の範囲</span></li>
  <li class="stat"><span class="stat-value">1<small> → </small>155<small>人</small></span><span class="stat-label">フォロワー。2026年4月4日から10月4日まで</span></li>
</ul>

店や教室、農園などで、AIにSNSの投稿を任せて手間を減らしたい人向けのサイトです。任せる前なら、どこまでAIに渡せて何が自分に残るか。任せたあとなら、自動で出しているのに伸びない週にどこを見るか。どちらも、1つのアカウントの実測で確かめられます。

## AIがやったこと、人に残ったこと

投稿が出るまでの流れを、担当ごとに色を分けて並べました。自動で回ったのは真ん中の段だけです。

<ol class="flow" aria-label="投稿が出るまでの流れと担当">
  <li class="flow-step is-human"><span class="flow-who">人</span><strong>写真を撮ってLINEに送る</strong><span>ここが止まると、その日の投稿は出ない</span></li>
  <li class="flow-step is-ai"><span class="flow-who">AI</span><strong>本文を書く</strong><span>作物ごとの栽培メモを参照し、口調と言葉の決まりを守って書く</span></li>
  <li class="flow-step is-ai"><span class="flow-who">自動</span><strong>投稿前に確かめて、Xに出す</strong><span>農薬の量やLINE向けの定型文が入っていれば止める</span></li>
  <li class="flow-step is-ai"><span class="flow-who">自動</span><strong>数字を集めて、週次レポートを作る</strong><span>投稿ごとの数字とフォロワー数を毎日記録する</span></li>
  <li class="flow-step is-human"><span class="flow-who">人</span><strong>リプライの相手を選んで送る</strong><span>AIは草案を2案出すまで。知らない人に届いたのはこちらだった</span></li>
  <li class="flow-step is-human"><span class="flow-who">人</span><strong>週1回、レポートを見て来週の1手を決める</strong><span>どの数字を画面に出すかも、人が決め直す</span></li>
</ol>

## 知りたいことから選ぶ

<div class="route-grid">
  <a class="route-card" href="/ai-x-operation"><span class="route-q">AIにどこまで任せられて、何が人に残るか</span><span class="route-a">仕組み・人に残った3つの仕事・費用・1回だけ起きた事故</span></a>
  <a class="route-card" href="/x-impressions-drop"><span class="route-q">自動で投稿しているのに、表示やフォロワーが伸びない</span><span class="route-a">AIへの指示を直す前に見る4項目</span></a>
  <a class="route-card" href="/sns-weekly-review"><span class="route-q">自動化したあと、週に1回なにを見て決めればいいか</span><span class="route-a">5分で終わる振り返りシートと記入例</span></a>
  <a class="route-card" href="/weekly"><span class="route-q">実際の週の数字を見たい</span><span class="route-a">毎週の実測（最新週から）</span></a>
</div>

## 6ヶ月で分かったこと

- **AIに守らせやすいのは、言葉の決まりでした。** 使う言葉と避ける言葉を表にして渡すと、「元気な」を含む定型の投稿は62%から6%に減りました
- **止まったのは、AIではなく人の側でした。** 171日のうち投稿があったのは151日です。空いた日は、写真を撮って送る私の手が止まった日でした
- **知らない人に届いたのは、自動投稿ではなく手で送ったリプライでした。** 9月までに自発投稿でいちばん表示された1本は176回、リプライには2,153回の1本がありました。10月3日に自発投稿が494回まで届きましたが、まだ4倍以上の差があります
- **AIの定型返答が、1回だけそのまま公開されました。** 8月22日、種の袋の写真に「わしは畑のことしかわからんのじゃ」と返した文がXに出ています。9月10日からは、この文を含む本文は投稿前に止めています

## 最新週の数字

2026年9月28日〜10月4日は、リプライ66件で、リプライ経由の総露出は前週の1,188から910へ減りました。それでもフォロワーは142人から155人へ13人増え、離脱は2週続けて0人でした。届いた量だけでは説明できない週です。

[この週の振り返りを読む →](/weekly/2026-w40)

## この記録を読むときの注意

- 数値は、1つのXアカウントの観測です
- このアカウントは店や商品の宣伝用ではありません。売上・問い合わせ・来店は測っていません
- 特定の投稿や施策がフォロワー増減の原因だったことは示しません
- 他のアカウントで同じ結果になることや、将来の成果は保証しません

運営者と公開範囲は [このサイトについて](/about) にあります。
