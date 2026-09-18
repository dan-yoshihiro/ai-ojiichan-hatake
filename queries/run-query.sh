#!/bin/sh
# 単文の .sql を --command 経路で実行する
#
# 実行: sh queries/run-query.sh queries/ai-bot-summary-7d.sql
#
# なぜ --file を使わないか:
# - wrangler d1 execute --file は import API（/d1/database/*/import）を通る。
#   結果テーブルが表示されず、トークンのスコープが足りないと
#   Authentication error [code: 10000] で落ちる（2026-09-18 に発生）
# - --command は query 経路なので、同じトークンで通る
# - weekly-analysis.sh / daily-observation.sh が既にこの方式
#
# 制約:
# - 複数文の .sql は渡せない（--command は1文のみ）。
#   schema/init.sql のような複数文は --file のままにする
# - SQL 冒頭の `--` コメント行は落としてから渡す。残すと wrangler が
#   CLI フラグと解釈して「Unknown argument」で落ちる（2026-09-18 に発生）。
#   行頭が `--` の行だけを対象にするので、文字列リテラル中の `--` は残る

set -e

if [ -z "$1" ]; then
  echo "usage: sh queries/run-query.sh <file.sql>" >&2
  exit 2
fi

if [ ! -f "$1" ]; then
  echo "run-query: $1 が見つからない" >&2
  exit 2
fi

sql=$(sed -e 's/^[[:space:]]*--.*$//' "$1" | sed -e '/^[[:space:]]*$/d')

if [ -z "$sql" ]; then
  echo "run-query: $1 に実行できるSQLがない" >&2
  exit 2
fi

npx wrangler d1 execute ai-ojiichan-logs --remote --command="$sql"
