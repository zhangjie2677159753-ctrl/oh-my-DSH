#!/usr/bin/env bash
# Deploy the OMO preset into the HOST DSH user preset root (~/.dsh/.agent-presets/omo).
# Additive only: creates one new user preset; never touches existing presets,
# the host composition, or the DSH checkout.
#
# The host runs the DSH checkout via tsx; the container's baked /dsh paths are
# rewritten to the repo's src tree, and bare @deepseek-ai/* imports resolve
# through entry symlinks (the same pattern proven in the container image).
# The key never enters any file here; the host's own credentials carry the
# model routes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_CHECKOUT="${DSH_CHECKOUT:-/home/zhangjie/projects/deepseek-harness}"
HOST_PRESET_DIR="${DSH_HOME:-$HOME/.dsh}/.agent-presets/omo"

mkdir -p "$HOST_PRESET_DIR"

# preset metadata + composition (composition has no /dsh paths; the
# file-backed row resolves ./omo-role-plugin.mjs from the preset dir)
cp "$REPO_ROOT/packages/omo-dsh/agent-presets/omo/preset.yml" "$HOST_PRESET_DIR/"
cp "$REPO_ROOT/packages/omo-dsh/agent-presets/omo/agent.cordis.yml" "$HOST_PRESET_DIR/"

# host variant of the plugin: rewrite the container bake root to the repo src
sed 's|file:///dsh/omo-plugin/packages-omo-dsh/|file://'"$REPO_ROOT"'/packages/omo-dsh/src/|g' \
  "$REPO_ROOT/packages/omo-dsh/src/dsh-plugin/omo-role-plugin.mjs" \
  > "$HOST_PRESET_DIR/omo-role-plugin.mjs"

# entry symlinks so bare @deepseek-ai/* resolve from the preset dir
mkdir -p "$HOST_PRESET_DIR/node_modules/@deepseek-ai"
ln -sfn "$DSH_CHECKOUT/packages/core/tools" "$HOST_PRESET_DIR/node_modules/@deepseek-ai/dsh-tools"
ln -sfn "$DSH_CHECKOUT/vendor/schemastery" "$HOST_PRESET_DIR/node_modules/@deepseek-ai/schemastery"

echo "installed: $HOST_PRESET_DIR"
ls -la "$HOST_PRESET_DIR"
