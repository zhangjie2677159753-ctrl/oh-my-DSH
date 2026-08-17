#!/usr/bin/env bash
# Build the controlled DSH test image from the LOCAL checkout (read-only).
# Strategy: extract a tar snapshot (excludes .git/node_modules/built dirs) into
# a temp directory and use it as a real build context. Tar handles the
# cross-device /tmp situation; the checkout itself is never modified.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH="${DSH_CHECKOUT:-/home/zhangjie/projects/deepseek-harness}"

if [ ! -f "$DSH/pnpm-lock.yaml" ]; then
  echo "DSH checkout not found at $DSH" >&2
  exit 2
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Extracting snapshot of $DSH ..."
mkdir -p "$STAGE/src"
tar -C "$DSH" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude='**/node_modules' \
  --exclude='**/lib' \
  --exclude='**/dist' \
  --exclude='**/.turbo' \
  -cf - . | tar -C "$STAGE/src" -xf -

# Neutralize the checkout's unrelated LOCAL modifications in the snapshot only:
# the test image must build the pinned HEAD, and the local client/connection
# patch actually breaks `tsc -b` (string vs never). The checkout stays untouched.
for f in \
  packages/client/connection/src/index.ts \
  packages/sandbox/sandbox/src/escalation.ts \
  packages/sandbox/sandbox/tests/escalation.spec.ts; do
  if git -C "$DSH" show "HEAD:$f" > "$STAGE/src/$f" 2>/dev/null; then
    echo "  reverted local modification in snapshot: $f"
  fi
done

cp "$ROOT/deploy/dsh-test-container/Dockerfile" "$STAGE/Dockerfile"

# Bake the OMO role plugin + its pure policy tree into the image so bare
# @deepseek-ai/* imports resolve through the install's real node_modules and
# relative imports keep their repo-relative structure.
mkdir -p "$STAGE/omo-plugin" \
         "$STAGE/omo-plugin/packages-omo-dsh/roles" \
         "$STAGE/omo-plugin/packages-omo-dsh/compat" \
         "$STAGE/omo-plugin/packages-omo-dsh/children" \
         "$STAGE/omo-plugin/packages-omo-dsh/boulder"
cp "$ROOT/packages/omo-dsh/src/dsh-plugin/omo-role-plugin.mjs" "$STAGE/omo-plugin/"
cp "$ROOT/packages/omo-dsh/src/roles/guard-decision.mjs" \
   "$ROOT/packages/omo-dsh/src/roles/policy-registry.mjs" \
   "$ROOT/packages/omo-dsh/src/roles/dynamic-sections.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/roles/"
cp "$ROOT/packages/omo-dsh/src/compat/tools.mjs" \
   "$ROOT/packages/omo-dsh/src/compat/session.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/compat/"
cp "$ROOT/packages/omo-dsh/src/children/notification.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/children/"
cp "$ROOT/packages/omo-dsh/src/boulder/role-mirror.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/boulder/"
mkdir -p "$STAGE/omo-plugin/packages-omo-dsh/continuation"
cp "$ROOT/packages/omo-dsh/src/continuation/driver.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/continuation/"
mkdir -p "$STAGE/omo-plugin/packages-omo-dsh/memory"
cp "$ROOT/packages/omo-dsh/src/memory/policy.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/memory/"
mkdir -p "$STAGE/omo-plugin/packages-omo-dsh/monitor"
cp "$ROOT/packages/omo-dsh/src/monitor/policy.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/monitor/"
mkdir -p "$STAGE/omo-plugin/packages-omo-dsh/team" "$STAGE/omo-plugin/packages-omo-dsh/openclaw"
cp "$ROOT/packages/omo-dsh/src/team/policy.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/team/"
cp "$ROOT/packages/omo-dsh/src/openclaw/policy.mjs" \
   "$STAGE/omo-plugin/packages-omo-dsh/openclaw/"

# P4: terminal-family entry shims + real-entry symlinks so the preset's
# absolute file-backed rows resolve bare @deepseek-ai/* specifiers through
# the install's workspace packages (same pattern as dsh-tools above).
cat > "$STAGE/omo-plugin/terminal-bash-row.mjs" <<'SHIM'
export * from '@deepseek-ai/dsh-terminal-bash'
SHIM
cat > "$STAGE/omo-plugin/tool-terminal-row.mjs" <<'SHIM'
export * from '@deepseek-ai/dsh-tool-terminal'
SHIM
cat > "$STAGE/omo-plugin/terminal-service-row.mjs" <<'SHIM'
// The dsh-terminal package exports the TerminalSessionService CLASS, not a
// Cordis plugin. This row wraps it: constructing the service registers it as
// ctx.terminals inside the preset's isolate realm group.
import { TerminalSessionService } from '@deepseek-ai/dsh-terminal'
export const name = 'omo-terminal-service'
export function apply(ctx) {
  new TerminalSessionService(ctx)
}
SHIM

# TEST-IMAGE-ONLY integration (documented in G1-EVIDENCE.md): the stock
# headless bundle composes no preset roster; its own comment says a deployment
# that configures one must join it in the agent's setup. We patch the SNAPSHOT
# (never the checkout) so headless sessions mount the `omo` preset the same
# way the web session path does. Source shape must match the pinned SHA.
node - "$STAGE/src/packages/bundle/headless/src/index.ts" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
let source = fs.readFileSync(file, 'utf8')
const anchor = 'setup: (agentCtx) => {'
if (!source.includes(anchor)) {
  console.error('build.sh: headless bundle setup anchor missing; SHA drift?')
  process.exit(1)
}
source = source.replace(
  anchor,
  `setup: async (agentCtx) => {
      const presetMount = agentCtx.get('agentPresets') as { mount(ctx: unknown, id: string): Promise<unknown> } | undefined
      if (presetMount !== undefined) {
        await presetMount.mount(agentCtx, 'omo')
      }`,
)
fs.writeFileSync(file, source)
console.log('build.sh: headless bundle patched to mount omo preset in setup')
NODE

# TEST-IMAGE-ONLY: G9 continuation loop. The stock headless run() makes ONE
# followup; patch the SNAPSHOT to loop up to 5 turns, deciding each boundary
# with the baked continuation driver and appending an audit decision event.
node - "$STAGE/src/packages/bundle/headless/src/index.ts" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
let source = fs.readFileSync(file, 'utf8')
const anchor = `  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()`
if (!source.includes(anchor)) {
  console.error('build.sh: headless followup anchor missing; SHA drift?')
  process.exit(1)
}
source = source.replace(
  anchor,
  `  // Variable specifier: tsc cannot resolve the runtime URL (no TS2307) and
  // the build does not bundle it; the file exists in the image at runtime.
  const driverUrl = 'file:///dsh/omo-plugin/packages-omo-dsh/continuation/driver.mjs'
  const { decideContinuation } = await import(driverUrl)
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  // G9 test-image continuation loop (bounded, decision audited per turn).
  const todosFrom = (session: any) => {
    let todos = []
    for (const ev of session.events) {
      if (ev.type === 'todo/write' && Array.isArray(ev.data?.todos)) todos = ev.data.todos
    }
    return todos
  }
  for (let turn = 0; turn < 5; turn++) {
    const decision = decideContinuation({
      role: 'sisyphus',
      todos: todosFrom(agent.session),
      stopRequested: false,
      userInterrupted: false,
      pendingQuestion: false,
      childrenRunning: false,
      externalBlocker: null,
      tokenLimitUnrecoverable: false,
      consecutiveFailures: 0,
      stagnationCount: 0,
      latch: { allTodosCompletedAt: null },
    })
    try { (agent.session as any).append('omo/continuation', { schemaVersion: 1, decision: decision.action, reason: decision.reason, turn }) } catch { /* audit best-effort */ }
    if (decision.action !== 'continue') break
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Continue working on the task.' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()
  }`,
)
fs.writeFileSync(file, source)
console.log('build.sh: headless bundle patched with G9 continuation loop')
NODE

# TEST-IMAGE-ONLY: the headless bundle composes no preset roster; add the
# agent-presets service row (same shape as the web-app bundle's insert block)
# to the SNAPSHOT's headless bundle patch so the mount above resolves.
HEADLESS_PATCH="$STAGE/src/packages/bundle/headless/cordis.patch.yml"
cat >> "$HEADLESS_PATCH" <<'EOF'

# omo-dsh test integration (snapshot only): preset roster service.
- insert:
    - id: agent-presets
      name: '@deepseek-ai/dsh-agent-presets'
      config:
        default: omo
EOF
echo 'build.sh: headless bundle patch extended with agent-presets insert'

IMAGE_TAG="${DSH_IMAGE_TAG:-omo-dsh-test}"
echo "Building image $IMAGE_TAG (proxy: 127.0.0.1:7890) ..."
docker build \
  --network=host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  -t "$IMAGE_TAG" \
  "$STAGE"
