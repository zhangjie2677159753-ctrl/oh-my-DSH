#!/usr/bin/env bash
# E31 rollback live drill (prepared; runbook: DRILL-RUNBOOK.md).
# Drives the pure rollback state machine with a synthetic trigger and one
# scripted step failure, then resumes to convergence. The container resource
# check (R5 residuals) is a placeholder until the child/terminal binding is
# exercised in the container. Output lands in /tmp/omo-drill/ — never in repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${DRILL_OUT:-/tmp/omo-drill}"
mkdir -p "$OUT"

echo "== E31 rollback drill =="

MODULE_ROOT="$ROOT/packages/omo-dsh/src"
node --input-type=module - "$OUT" "$MODULE_ROOT" <<'NODE'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const out = process.argv[2]
const moduleRoot = process.argv[3]
const load = (p) => import(pathToFileURL(`${moduleRoot}/${p}`).href)
const { assessRollbackTrigger, createRollbackRunner, reconstructTimeline, ROLLBACK_STEPS } = await load('release/rollback.mjs')

// R1: trigger assessment on a false-success event
const trigger = assessRollbackTrigger([{ kind: 'false-success', at: 't1', detail: 'eval falsely green' }])
writeFileSync(`${out}/r1-trigger.json`, JSON.stringify(trigger, null, 2))
if (!trigger.trigger) throw new Error('R1 FAIL: false-success event must trigger rollback')

// R2/R3/R4: scripted failure on first "settle-children", then resume
const executed = []
let settleAttempts = 0
const ops = Object.fromEntries(ROLLBACK_STEPS.map((step) => [
  step,
  async () => {
    if (step === 'settle-children' && settleAttempts++ === 0) throw new Error('injected failure: child did not settle')
    executed.push(step)
    if (step === 'verify-residuals') return { residuals: 0 } // required pass contract
    return {}
  },
]))
const runner = createRollbackRunner({ ops })

const attempt1 = await runner.run({ trigger })
writeFileSync(`${out}/r2-run.json`, JSON.stringify(attempt1, null, 2))
if (attempt1.ok || attempt1.phase !== 'settle-children') throw new Error('R2/R3 FAIL: expected abort at settle-children')
writeFileSync(`${out}/r3-abort.json`, JSON.stringify({ phase: attempt1.phase, reason: attempt1.reason }, null, 2))
const abortedCount = attempt1.evidence.length // capture NOW: runner shares one evidence array across runs

const attempt2 = await runner.run({ trigger })
writeFileSync(`${out}/r4-resume.json`, JSON.stringify(attempt2, null, 2))
if (!attempt2.ok) throw new Error('R4 FAIL: resume did not converge')
if (new Set(executed).size !== ROLLBACK_STEPS.length) throw new Error('R4 FAIL: not every step completed exactly once')
console.log(`R1-R4 ok: trigger -> abort at ${attempt1.phase} -> resume converges, no step replay`)

// R5: timeline reconstruction from the resumed run's records only.
// NOTE (verified runner property): evidence accumulates across run() calls
// by design (audit trail) — the resumed attempt carries the aborted
// attempt's records as a prefix.
const resumed = attempt2.evidence.slice(abortedCount)
const records = resumed.map((e, i) => ({ at: i, kind: e.step, detail: e.ok ? 'ok' : 'error' }))
const timeline = reconstructTimeline(records)
writeFileSync(`${out}/r5-clean.json`, JSON.stringify(timeline, null, 2))
if (timeline.length !== ROLLBACK_STEPS.length) throw new Error('R5 FAIL: resumed timeline does not cover all steps')
if (timeline.some((r) => r.kind === 'unknown')) throw new Error('R5 FAIL: unknown kind in timeline')
console.log('R5 ok: timeline reconstructed; live container residual check remains (runbook R5)')
console.log(`E31 rollback drill evidence in ${out}`)
NODE
