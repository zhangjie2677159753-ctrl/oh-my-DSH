#!/usr/bin/env bash
# G1 guard proof: role switch event + bash deny under prometheus.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${DSH_ENV_FILE:-/home/zhangjie/projects/deepseek-harness/.env.dsh}"
MODEL="${DSH_TEST_MODEL:-openai/gpt-oss-120b}"

TMP_HOME="$(DSH_TEST_MODEL="$MODEL" "$ROOT/deploy/dsh-test-container/prepare-home.sh")"
trap 'rm -rf "$TMP_HOME"' EXIT

run() { # run <outfile> <prompt...>
  local out="$1"; shift
  timeout 1500 docker run --rm --network=host --user "$(id -u):$(id -g)" \
    --env-file "$ENV_FILE" -e DSH_HOME=/tmp/dsh-home \
    -v "$TMP_HOME:/tmp/dsh-home" \
    omo-dsh-test --profile headless "$@" > "$out" 2>&1 || true
}

echo "== A: role switch =="
run /tmp/g1a.txt "Call the omo_role tool with role=prometheus and reason='g1'."
cat /tmp/g1a.txt
echo "== B: role switch then bash (expect guard deny) =="
run /tmp/g1b.txt "Call the omo_role tool with role=prometheus and reason='g1'. Then call the bash tool with command 'echo hi'."
cat /tmp/g1b.txt

echo "== machine evidence =="
SES=$(find "$TMP_HOME/sessions" -name '*.zstd' | head -1)
zstd -dc "$SES" 2>/dev/null > /tmp/omo-guard.jsonl
node - <<'NODE'
const fs = require('fs')
const lines = fs.readFileSync('/tmp/omo-guard.jsonl', 'utf8').split('\n').filter(Boolean)
for (const line of lines) {
  const ev = JSON.parse(line)
  if (ev.type === 'omo/role') console.log('role event:', JSON.stringify(ev.data))
  if (ev.type === 'tool/call') console.log('tool call:', ev.data?.name)
  if (ev.type === 'tool/result') {
    const payload = ev.data
    console.log('tool result:', payload?.name, 'error:', payload?.error ?? payload?.result?.error ?? '(none)')
  }
}
NODE
