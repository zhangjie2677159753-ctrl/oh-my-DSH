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

cp "$ROOT/deploy/dsh-test-container/Dockerfile" "$STAGE/Dockerfile"

echo "Building image omo-dsh-test (proxy: 127.0.0.1:7890) ..."
docker build \
  --network=host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  -t omo-dsh-test \
  "$STAGE"
