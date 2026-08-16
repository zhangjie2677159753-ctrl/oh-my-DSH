#!/usr/bin/env bash
# G1 lifecycle in ONE headless turn: status → role switch → status → bash
# attempt (guard must deny under prometheus). Model: DSH_TEST_MODEL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${DSH_ENV_FILE:-/home/zhangjie/projects/deepseek-harness/.env.dsh}"
MODEL="${DSH_TEST_MODEL:-openai/gpt-oss-120b}"
TMP_HOME="$(DSH_TEST_MODEL="$MODEL" "$ROOT/deploy/dsh-test-container/prepare-home.sh")"
trap 'rm -rf "$TMP_HOME"' EXIT

timeout 1500 docker run --rm --network=host --user "$(id -u):$(id -g)" \
  --env-file "$ENV_FILE" -e DSH_HOME=/tmp/dsh-home \
  -v "$TMP_HOME:/tmp/dsh-home" \
  omo-dsh-test --profile headless \
  "Step 1: call omo_role_status. Step 2: call omo_role with role=prometheus and reason='g1'. Step 3: call omo_role_status. Step 4: call bash with command='echo hi'. Then summarize each result." \
  > /tmp/omo-lifecycle-model.txt 2>&1 || true

echo "== model transcript =="
cat /tmp/omo-lifecycle-model.txt

echo "== machine evidence =="
SES=$(find "$TMP_HOME/sessions" -name '*.zstd' | head -1)
zstd -dc "$SES" 2>/dev/null > /tmp/omo-lifecycle.jsonl
node - <<'NODE'
const fs = require('fs')
const lines = fs.readFileSync('/tmp/omo-lifecycle.jsonl', 'utf8').split('\n').filter(Boolean)
for (const line of lines) {
  const ev = JSON.parse(line)
  if (ev.type === 'omo/role') console.log('role event:', JSON.stringify(ev.data))
  if (ev.type === 'tool/call') console.log('tool call:', ev.data?.name)
  if (ev.type === 'tool/result') {
    const err = ev.data?.result?.error ?? ev.data?.error ?? null
    console.log('tool result:', ev.data?.name, err ? `ERROR(${err})` : 'ok')
  }
}
NODE
