#!/usr/bin/env bash
# Build the controlled DSH test image from the LOCAL checkout (read-only).
# Uses the host proxy for pnpm registry traffic; run on the host, not in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH="${DSH_CHECKOUT:-/home/zhangjie/projects/deepseek-harness}"

if [ ! -f "$DSH/pnpm-lock.yaml" ]; then
  echo "DSH checkout not found at $DSH" >&2
  exit 2
fi

tar -C "$DSH" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude='**/node_modules' \
  --exclude='**/lib' \
  --exclude='**/dist' \
  --exclude='**/.turbo' \
  -cf - . | docker build \
  --network=host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  -t omo-dsh-test \
  -f "$ROOT/deploy/dsh-test-container/Dockerfile" -
