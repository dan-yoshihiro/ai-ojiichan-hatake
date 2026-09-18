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

set -e

if [ -z "$1" ]; then
  echo "usage: sh queries/run-query.sh <file.sql>" >&2
  exit 2
fi

if [ ! -f "$1" ]; then
  echo "run-query: $1 が見つからない" >&2
  exit 2
fi

npx wrangler d1 execute ai-ojiichan-logs --remote --command "$(cat "$1")"
