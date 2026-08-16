#!/usr/bin/env bash
# E28 live eval runner: iterates docs/plans/eval-corpus.json E2E scenarios,
# one fresh headless session per scenario with the OMO preset, and records
# machine evidence (tool calls, role events, assistant turns) plus the model
# transcript. Evidence lands in EVAL_OUT (default /tmp/omo-eval) — never in
# the repo; only the SUMMARY is committed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${DSH_ENV_FILE:-/home/zhangjie/projects/deepseek-harness/.env.dsh}"
MODEL="${DSH_TEST_MODEL:-openai/gpt-oss-120b}"
EVAL_OUT="${EVAL_OUT:-/tmp/omo-eval}"
CORPUS="$ROOT/docs/plans/eval-corpus.json"
START_ID="${START_ID:-}"
MAX_SCENARIOS="${MAX_SCENARIOS:-17}"

mkdir -p "$EVAL_OUT"
summary="$EVAL_OUT/summary.json"

run_scenario() {
  local id="$1" prompt="$2"
  local dir="$EVAL_OUT/$id"
  mkdir -p "$dir"
  local home
  home="$(DSH_TEST_MODEL="$MODEL" "$ROOT/deploy/dsh-test-container/prepare-home.sh")"
  local t0; t0=$(date +%s)
  timeout 1500 docker run --rm --network=host --user "$(id -u):$(id -g)" \
    --env-file "$ENV_FILE" -e DSH_HOME=/tmp/dsh-home \
    -v "$home:/tmp/dsh-home" \
    omo-dsh-test --profile headless "$prompt" > "$dir/transcript.txt" 2>&1 || true
  local t1; t1=$(date +%s)
  local ses; ses=$(find "$home/sessions" -name '*.zstd' | head -1)
  if [ -n "$ses" ]; then
    zstd -dc "$ses" 2>/dev/null > "$dir/session.jsonl"
  else
    echo '{}' > "$dir/session.jsonl"
  fi
  node "$ROOT/deploy/dsh-test-container/parse-evidence.mjs" \
    "$dir/session.jsonl" "$dir/transcript.txt" "$id" "$((t1-t0))"
  rm -rf "$home" 2>/dev/null || true
}

node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$CORPUS"
ids=$(node -e "
const c = require('$CORPUS')
let list = c.e2e.map(e => e.id)
if ('$START_ID' !== '') list = list.slice(list.indexOf('$START_ID'))
if ('$MAX_SCENARIOS' !== 'all') list = list.slice(0, Number('$MAX_SCENARIOS'))
process.stdout.write(list.join(' '))
")

: > "$summary"
echo '[' > "$summary"
first=1
for id in $ids; do
  prompt=$(node -e "
const c = require('$CORPUS')
const s = c.e2e.find(e => e.id === '$id')
process.stdout.write('Scenario ' + s.title + '. Requirements: ' + s.steps.join(' '))
")
  echo "== $id =="
  row="$(run_scenario "$id" "$prompt")"
  [ "$first" = 0 ] && echo ',' >> "$summary"
  printf '%s' "$row" >> "$summary"
  first=0
done
echo ']' >> "$summary"
echo "summary: $summary"
