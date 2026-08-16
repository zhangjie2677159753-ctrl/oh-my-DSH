#!/usr/bin/env bash
# OpenCode GO model route variant of prepare-home.sh: catalog provider
# `opencode-go` (pi-ai catalogs it; the host deployment already routes the
# flash subagent backend through it), model default deepseek-v4-flash.
# Key comes from the --env-file at run time (OPENCODE_GO_API_KEY), never
# written here. Prints the temp home path on stdout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_HOME="$(mktemp -d)"

mkdir -p "$TMP_HOME/.agent-presets/omo"
cp "$ROOT"/packages/omo-dsh/agent-presets/omo/preset.yml \
   "$ROOT"/packages/omo-dsh/agent-presets/omo/agent.cordis.yml \
   "$ROOT"/packages/omo-dsh/agent-presets/omo/omo-role-plugin.mjs \
   "$TMP_HOME/.agent-presets/omo/"

HOST_SETTINGS="${DSH_SETTINGS_SOURCE:-$HOME/.dsh/settings.yaml}"
{
  echo 'agent-default-model:'
  echo '  provider: opencode-go'
  echo "  model: ${DSH_TEST_MODEL:-deepseek-v4-flash}"
  echo 'agent-presets:'
  echo '  default: omo'
  echo 'llm-pi-ai:'
  echo '  providers:'
  echo '    opencode-go:'
  # host's opencode-go model list (models only, stop before apiKeyEnv)
  awk '/^    opencode-go:$/{flag=1; next} flag && /^    [a-zA-Z]/{exit} flag && /^      apiKeyEnv:/{exit} flag{print}' "$HOST_SETTINGS"
  echo '      apiKeyEnv: OPENCODE_GO_API_KEY'
} > "$TMP_HOME/settings.yaml"

# Same headless patches as the nvidia route: pi-ai adapter + preset roster.
{
  echo '- id: llm-pi-ai'
  echo "  name: '@deepseek-ai/dsh-llm-pi-ai'"
  echo '- id: agent-presets'
  echo "  name: '@deepseek-ai/dsh-agent-presets'"
} > "$TMP_HOME/cordis.patch.yml"

echo "$TMP_HOME"
