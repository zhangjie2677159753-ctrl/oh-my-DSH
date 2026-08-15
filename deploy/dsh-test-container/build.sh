#!/usr/bin/env bash
# Build the controlled DSH test image from the LOCAL checkout (read-only).
# BuildKit cannot read a host-side Dockerfile with a stdin context, so we
# stage a hardlink snapshot of the checkout (minus node_modules/.git) into a
# temp directory and use it as a real build context. The checkout itself is
# never modified.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH="${DSH_CHECKOUT:-/home/zhangjie/projects/deepseek-harness}"

if [ ! -f "$DSH/pnpm-lock.yaml" ]; then
  echo "DSH checkout not found at $DSH" >&2
  exit 2
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Staging hardlink snapshot of $DSH ..."
cp -al "$DSH/." "$STAGE/src"
rm -rf "$STAGE/src/node_modules" "$STAGE/src/.git"
find "$STAGE/src" -type d \( -name lib -o -name dist -o -name .turbo \) -prune -exec rm -rf {} +

cp "$ROOT/deploy/dsh-test-container/Dockerfile" "$STAGE/Dockerfile"

echo "Building image omo-dsh-test (proxy: 127.0.0.1:7890) ..."
docker build \
  --network=host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  -t omo-dsh-test \
  "$STAGE"
