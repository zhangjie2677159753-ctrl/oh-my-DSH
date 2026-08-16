#!/usr/bin/env bash
# Post-eval finisher: deterministic summary rebuild -> score report (with
# machine hard gates) -> optional commit of docs/plans/MODEL-EVAL-REPORT.md.
# Run ONLY after the live eval (run-eval.sh) has fully settled.
# usage: ./finish-eval.sh [eval-dir] [--commit]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVAL_DIR="${1:-/tmp/omo-eval}"
COMMIT=0
[ "${2:-}" = "--commit" ] && COMMIT=1

SUMMARY="$EVAL_DIR/summary.json"

node "$ROOT/deploy/dsh-test-container/rebuild-summary.mjs" "$EVAL_DIR" "$SUMMARY"
node "$ROOT/deploy/dsh-test-container/eval-status.mjs" "$EVAL_DIR"
node "$ROOT/deploy/dsh-test-container/score-eval.mjs" "$SUMMARY"

if [ "$COMMIT" = "1" ]; then
  cd "$ROOT"
  git add docs/plans/MODEL-EVAL-REPORT.md
  git diff --cached --check
  git commit -m "docs(eval): model eval report (NIM gpt-oss-120b)"
fi
echo "finish-eval done: report -> docs/plans/MODEL-EVAL-REPORT.md"
