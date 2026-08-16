#!/usr/bin/env bash
# G13' clean-consumer drill: the OMO preset payload must install into a FRESH
# DSH_HOME with no repo access and pass discovery + plugin load + payload
# digest verification. No model calls; runs against the existing test image.
# Evidence: /tmp/omo-drill/consumer-*.json (conclusion committed, raw in tmp).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${DRILL_OUT:-/tmp/omo-drill}"
mkdir -p "$OUT"

echo "== clean-consumer drill =="

# 1. Payload gate: the artifact the consumer receives must be digest-pinned.
node "$ROOT/tools/verify-preset-payload.mjs"

# 2. Fresh home from the payload only (prepare-home copies preset files).
HOME_PATH="$(DSH_TEST_MODEL=openai/gpt-oss-120b "$ROOT/deploy/dsh-test-container/prepare-home.sh")"

# 3. Discovery in the clean consumer (no repo mount, no node_modules overlay).
docker run --rm --network=host --user "$(id -u):$(id -g)" --entrypoint node \
  -e DSH_HOME=/tmp/dsh-home -v "$HOME_PATH:/tmp/dsh-home" \
  omo-dsh-test --input-type=module -e '
const { discoverPresets } = await import("file:///dsh/packages/preset/agent-presets/lib/index.js")
const { join } = await import("node:path")
const root = { path: join(process.env.DSH_HOME, ".agent-presets"), writable: true }
const presets = await discoverPresets([root])
for (const p of presets) console.log(JSON.stringify({ id: p.id, broken: p.broken ?? false }))
const omo = presets.find((p) => p.id === "omo")
if (!omo || omo.broken) { console.error("consumer discovery FAIL"); process.exit(1) }
console.log("consumer discovery ok")
' > "$OUT/consumer-discovery.jsonl"

# 4. Plugin module load in the consumer (exports + section + guard surface).
docker run --rm --network=host --user "$(id -u):$(id -g)" --entrypoint node \
  -e DSH_HOME=/tmp/dsh-home -v "$HOME_PATH:/tmp/dsh-home" \
  omo-dsh-test --input-type=module -e '
const mod = await import("file:///dsh/omo-plugin/omo-role-plugin.mjs")
const ok = typeof mod.apply === "function" && mod.name === "omo-role" && Array.isArray(mod.inject)
console.log(JSON.stringify({ name: mod.name, inject: mod.inject, hasApply: typeof mod.apply === "function" }))
if (!ok) { console.error("consumer plugin load FAIL"); process.exit(1) }
console.log("consumer plugin load ok")
' > "$OUT/consumer-plugin.jsonl"

rm -rf "$HOME_PATH"
echo "clean-consumer drill passed; evidence in $OUT"
