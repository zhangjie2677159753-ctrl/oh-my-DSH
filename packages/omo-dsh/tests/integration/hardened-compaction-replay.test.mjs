// Integration contracts: Atlas hardened profile end-to-end + compaction
// replay continuity + Plan-Compiler IR validation gate.
import test from "node:test"
import assert from "node:assert/strict"
import { PRIMARY_ROLE_POLICIES } from "../../src/roles/policy-registry.mjs"
import { resolveToolDecision } from "../../src/compat/tools.mjs"
import { samplePlan } from "../../src/planning/plan-ir.mjs"
import { evaluateDependencyGate, evaluateCompletionGate } from "../../src/atlas/work-policy.mjs"
import { createVerificationManifest, addCheck, createEvidenceStore, evaluatePlan } from "../../src/verification/evidence.mjs"
import { createPlanningPipeline } from "../../src/planning/pipeline.mjs"
import { buildResumeContext, assertResumeContinuity } from "../../src/compaction/resume-context.mjs"
import { applyCompaction } from "../../src/compat/persistence.mjs"
import { reduceRoleFold } from "../../src/compat/session.mjs"

test("atlas hardened profile: business writes denied, orchestration allowed", () => {
  const hardened = PRIMARY_ROLE_POLICIES.atlas["deny-business-files"]
  assert.equal(resolveToolDecision(hardened, "atlas", "task").decision, "allow")
  assert.equal(resolveToolDecision(hardened, "atlas", "teammate").decision, "allow")
  assert.equal(resolveToolDecision(hardened, "atlas", "write").decision, "deny")
  assert.equal(resolveToolDecision(hardened, "atlas", "edit").decision, "deny")
  assert.equal(resolveToolDecision(hardened, "atlas", "apply_patch").decision, "deny")
  assert.equal(resolveToolDecision(hardened, "atlas", "todowrite").decision, "deny")
  // compat stays permissive on writes (documented deviation)
  const compat = PRIMARY_ROLE_POLICIES.atlas.compat
  assert.equal(resolveToolDecision(compat, "atlas", "write").decision, "allow")
})

test("hardened completion: dependency gate + machine evidence gate compose", () => {
  const plan = structuredClone(samplePlan())
  assert.equal(evaluateDependencyGate(plan, 1).ready, false)
  plan.tasks[0].status = "completed"
  assert.equal(evaluateDependencyGate(plan, 1).ready, true)

  let manifest = createVerificationManifest(plan)
  manifest = addCheck(manifest, "todo:1", { command: "node --test", expectExit: 0 })
  const store = createEvidenceStore()
  const evaluation = evaluatePlan(manifest, store.records())
  assert.equal(evaluation.done, false) // no evidence anywhere → not done
  store.record({ key: "todo:1", command: "node --test", exitCode: 0, planId: plan.planId, planRevision: plan.revision })
  assert.equal(evaluatePlan(manifest, store.records()).done, false) // other items unverified
  assert.equal(evaluateCompletionGate(plan, evaluation.results).complete, false)
})

test("Plan-Compiler rejects free-form IR before render or handoff", () => {
  const pipeline = createPlanningPipeline({ profile: "dsh-structured-plan", reviewRequired: false })
  pipeline.startInterview("n"); pipeline.approve(); pipeline.scaffold({}); pipeline.metis([])
  const bad = pipeline.compilePlan({ markdown: "just text, not IR" })
  assert.equal(bad.ok, false)
  assert.ok(bad.error.includes("invalid plan IR"))
  assert.equal(pipeline.state(), "metis-done") // state did not advance
  const good = pipeline.compilePlan(samplePlan())
  assert.equal(good.ok, true)
  assert.equal(pipeline.state(), "authored")
})

test("compaction replay: canonical events survive; role/work continuity holds", () => {
  const roleEvent = { type: "omo/role", seq: 0, time: 1, data: { schemaVersion: 1, role: "atlas", revision: 1, changedBy: "start-work", reason: "r", changedAt: "2026-08-15T12:00:00Z" } }
  const events = [
    { type: "turn/start", seq: 1, data: {} },
    { type: "omo/role", seq: 2, time: 2, data: { ...roleEvent.data } },
    { type: "compaction/start", seq: 3, data: {} },
    { type: "compaction/summary", seq: 4, data: { node: { id: "s1", sourceEventSeqs: [] } } },
    { type: "compaction/end", seq: 5, data: {} },
  ]
  const out = applyCompaction(events)
  assert.equal(out.canonicalCount, 2) // turn/start + omo/role survive verbatim
  assert.equal(out.compactionRecords, 3)

  const roleState = reduceRoleFold([events[1]])
  const before = buildResumeContext({ roleState, work: { id: "w1", planName: "p", status: "active" }, plan: { planId: "p1", revision: 1 } }).context
  const after = buildResumeContext({ roleState, work: { id: "w1", planName: "p", status: "active" }, plan: { planId: "p1", revision: 1 } }).context
  assert.deepEqual(assertResumeContinuity(before, after), [])
  // a compacted session that silently switched roles must fail continuity
  const wrongRole = buildResumeContext({ roleState: { role: "prometheus", revision: 2 }, work: { id: "w1", planName: "p", status: "active" } }).context
  assert.ok(assertResumeContinuity(before, wrongRole).some((e) => e.includes("role changed")))
})
