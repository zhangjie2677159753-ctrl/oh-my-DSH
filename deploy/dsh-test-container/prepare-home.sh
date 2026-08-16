#!/usr/bin/env bash
# Build a container DSH_HOME: OMO preset + derived settings.yaml whose nvidia
# provider is HAND-DECLARED (NIM is not a pi-ai catalog key): api + baseURL +
# the host's model list + apiKeyEnv reference (no secret values). Prints the
# temp home path on stdout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST_SETTINGS="${DSH_SETTINGS_SOURCE:-$HOME/.dsh/settings.yaml}"
TMP_HOME="$(mktemp -d)"

mkdir -p "$TMP_HOME/.agent-presets/omo"
cp "$ROOT"/packages/omo-dsh/agent-presets/omo/preset.yml \
   "$ROOT"/packages/omo-dsh/agent-presets/omo/agent.cordis.yml \
   "$ROOT"/packages/omo-dsh/agent-presets/omo/omo-role-plugin.mjs \
   "$TMP_HOME/.agent-presets/omo/"

{
  echo 'agent-default-model:'
  echo '  provider: nvidia'
  echo "  model: ${DSH_TEST_MODEL:-deepseek-ai/deepseek-v4-flash-0731}"
  echo 'agent-presets:'
  echo '  default: omo'
  # mirror the host deployment's permission preset (the host runs
  # danger-full-access; without it shell/PTY execution requires a sandbox
  # backend the test container does not run)
  echo 'permission:'
  echo '  defaultPreset: danger-full-access'
  echo 'llm-pi-ai:'
  echo '  providers:'
  echo '    nvidia:'
  echo '      displayName: NVIDIA NIM'
  echo '      api: openai-completions'
  echo '      baseURL: https://integrate.api.nvidia.com/v1'
  # host's nvidia model list (models only, stop before apiKeyEnv)
  awk '/^    nvidia:$/{flag=1; next} flag && /^    [a-zA-Z]/{exit} flag && /^      apiKeyEnv:/{exit} flag{print}' "$HOST_SETTINGS"
  echo '      apiKeyEnv: NVIDIA_API_KEY'
} > "$TMP_HOME/settings.yaml"

# Profile patch: preset roster service (headless ships rosterless) + generic
# pi-ai adapter so the nvidia route resolves.
{
  echo '- id: llm-pi-ai'
  echo "  name: '@deepseek-ai/dsh-llm-pi-ai'"
  echo '- id: agent-presets'
  echo "  name: '@deepseek-ai/dsh-agent-presets'"
} > "$TMP_HOME/cordis.patch.yml"

echo "$TMP_HOME"
