#!/usr/bin/env bash
# One headless DSH turn inside the container with the OMO preset and the
# NVIDIA NIM route. Keys enter ONLY via --env-file; nothing is written to the
# repo or echoed. The container runs as the host uid so mounted-home cleanup
# works after exit. Usage: run-headless.sh "--profile headless" "<prompt>"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${DSH_ENV_FILE:-/home/zhangjie/projects/deepseek-harness/.env.dsh}"
TMP_HOME="$("$ROOT/deploy/dsh-test-container/prepare-home.sh")"
trap 'rm -rf "$TMP_HOME"' EXIT

docker run --rm \
  --network=host \
  --user "$(id -u):$(id -g)" \
  --env-file "$ENV_FILE" \
  -e DSH_HOME=/tmp/dsh-home \
  -v "$TMP_HOME:/tmp/dsh-home" \
  omo-dsh-test "$@"
