#!/usr/bin/env bash
# Boot the controlled DSH web container with a FRESH DSH_HOME containing only
# our OMO preset. Host port 3090 (the running deployment keeps 3080).
# Stops with Ctrl-C; no host state is touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME"' EXIT

mkdir -p "$TMP_HOME/.agent-presets/omo"
cp "$ROOT/packages/omo-dsh/agent-presets/omo/preset.yml" \
   "$ROOT/packages/omo-dsh/agent-presets/omo/agent.cordis.yml" \
   "$TMP_HOME/.agent-presets/omo/"

echo "DSH test home: $TMP_HOME"
echo "Web UI: http://127.0.0.1:3090"

docker run --rm -it \
  -p 127.0.0.1:3090:3080 \
  -e DSH_HOME=/home/node/.dsh \
  -v "$TMP_HOME:/home/node/.dsh" \
  omo-dsh-test web --port 3080
