import test from "node:test"
import assert from "node:assert/strict"
import { createVerificationManifest, addCheck, createEvidenceStore, evaluateItem, evaluatePlan } from "../src/verification/evidence.mjs"
import { samplePlan } from "../src/planning/plan-ir.mjs"

function manifestWithChecks() {
  let manifest = createVerificationManifest(samplePlan())
  manifest = addCheck(manifest, "todo:1", { command: "node --test", expectExit: 0 })
  manifest = addCheck(manifest, "todo:2", { command: "lint", expectExit: 0 })
  manifest = addCheck(manifest, "final-wave:f1", { command: "full-suite", expectExit: 0 })
  return manifest
}

test("manifest covers every task and final-wave item", () => {
  const manifest = createVerificationManifest(samplePlan())
  assert.deepEqual(manifest.items.map((i) => i.key), ["todo:1", "todo:2", "final-wave:f1"])
})

test("addCheck validates command and expectExit", () => {
  const manifest = createVerificationManifest(samplePlan())
  assert.throws(() => addCheck(manifest, "todo:1", { command: "", expectExit: 0 }), /command/)
  assert.throws(() => addCheck(manifest, "todo:1", { command: "x", expectExit: "zero" }), /expectExit/)
})

test("failed command never closes a task", () => {
  const manifest = manifestWithChecks()
  const store = createEvidenceStore()
  store.record({ key: "todo:1", command: "node --test", exitCode: 1, outputDigest: "d1", planId: "plan-1", planRevision: 1 })
  const result = evaluateItem(manifest, "todo:1", store.records())
  assert.equal(result.status, "failed")
  assert.ok(result.reasons.some((r) => r.includes("exited 1")))
})

test("stale evidence (wrong plan revision) is rejected", () => {
  const manifest = manifestWithChecks()
  const store = createEvidenceStore()
  store.record({ key: "todo:1", command: "node --test", exitCode: 0, outputDigest: "d1", planId: "plan-1", planRevision: 0 })
  const result = evaluateItem(manifest, "todo:1", store.records())
  assert.equal(result.status, "failed")
  assert.ok(result.reasons.some((r) => r.includes("stale evidence")))
})

test("missing evidence and missing checks fail closed", () => {
  const manifest = manifestWithChecks()
  const store = createEvidenceStore()
  const result = evaluateItem(manifest, "todo:1", store.records())
  assert.equal(result.status, "failed")
  assert.ok(result.reasons.some((r) => r.includes("missing evidence")))

  const bare = createVerificationManifest(samplePlan())
  const noChecks = evaluateItem(bare, "todo:1", [])
  assert.equal(noChecks.status, "no-checks")
})

test("full evidence makes the plan pass into verifying", () => {
  const manifest = manifestWithChecks()
  const store = createEvidenceStore()
  for (const [key, command] of [["todo:1", "node --test"], ["todo:2", "lint"], ["final-wave:f1", "full-suite"]]) {
    store.record({ key, command, exitCode: 0, outputDigest: `digest-${key}`, planId: "plan-1", planRevision: 1 })
  }
  const evaluation = evaluatePlan(manifest, store.records())
  assert.equal(evaluation.done, true)
  assert.equal(evaluation.phase, "verifying")
  assert.equal(evaluation.digest.length, 64)
})

test("model self-claims are not evidence", () => {
  // A record without a matching manifest check (e.g. a plain text "passed")
  // cannot satisfy any item — structural property: checks are the source of truth.
  const manifest = manifestWithChecks()
  const store = createEvidenceStore()
  store.record({ key: "todo:1", command: "model said: tests pass", exitCode: 0, planId: "plan-1", planRevision: 1 })
  const result = evaluateItem(manifest, "todo:1", store.records())
  assert.equal(result.status, "failed")
  assert.ok(result.reasons.some((r) => r.includes("missing evidence for node --test")))
})
