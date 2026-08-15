import test from "node:test"
import assert from "node:assert/strict"
import { resumeFromLog, forkRoleState, assertChildCannotMutateParent } from "../src/roles/lifecycle.mjs"
import { createPlanningPipeline, PLANNING_STATES } from "../src/planning/pipeline.mjs"
import { decideContinuation, observeTurn, CONTINUATION_CONSTANTS } from "../src/continuation/driver.mjs"

const roleEvent = (seq, revision, role = "atlas", changedBy = "start-work") => ({
  type: "omo/role", seq, time: 1000 + seq,
  data: { schemaVersion: 1, role, revision, changedBy, reason: "r", changedAt: "2026-08-15T12:00:00Z" },
})

// --- 0502 resume/fork ---

test("resume reconstructs role from the log only", () => {
  const state = resumeFromLog([roleEvent(1, 2, "prometheus")])
  assert.equal(state.role, "prometheus")
  assert.equal(state.revision, 2)
  assert.throws(() => resumeFromLog("not-an-array"), /expected event array/)
})

test("fork inherits role with a migration stamp and advanced revision", () => {
  const parent = [roleEvent(1, 3, "atlas")]
  const { inherited, forkEvent, foldAfterFork } = forkRoleState(parent)
  assert.equal(inherited.role, "atlas")
  assert.equal(forkEvent.data.changedBy, "migration")
  assert.equal(forkEvent.data.revision, 4)
  assert.equal(foldAfterFork.revision, 4)
  assert.doesNotThrow(() => assertChildCannotMutateParent(foldAfterFork, inherited))
  assert.throws(() => assertChildCannotMutateParent(foldAfterFork, foldAfterFork), /distinct/)
})

// --- E13 planning pipeline ---

test("compat trace: approval gates mandatory metis; author only in compat profile", () => {
  const p = createPlanningPipeline({ profile: "opencode-compat", reviewRequired: false })
  assert.equal(p.startInterview("notes").ok, true)
  assert.equal(p.metis([]).ok, false) // before approval
  assert.equal(p.scaffold({}).ok, false) // before approval
  assert.equal(p.approve().ok, true)
  assert.equal(p.scaffold({ scope: "x" }).ok, true)
  assert.equal(p.metis([{ gap: "g" }]).ok, true)
  assert.equal(p.compilePlan({}).ok, false) // wrong profile
  assert.equal(p.authorPlan("# plan").ok, true)
  const handoff = p.approveHandoff()
  assert.equal(handoff.ok, true)
  assert.equal(handoff.manifest.reviewRequired, false)
  assert.ok(handoff.manifest.planDigest.length === 64)
})

test("structured trace: compiler only after metis; conditional review not universal", () => {
  const p = createPlanningPipeline({ profile: "dsh-structured-plan", reviewRequired: false })
  p.startInterview("n"); p.approve(); p.scaffold({}); p.metis([])
  assert.equal(p.authorPlan("x").ok, false)
  assert.equal(p.compilePlan({ tasks: [] }).ok, true)
  assert.equal(p.review("approve").ok, false) // reviewRequired false
  const handoff = p.approveHandoff()
  assert.equal(handoff.ok, true)
  assert.equal(p.state(), "approved")
})

test("reviewRequired=true runs Momus/Oracle and bounded repair preserves rejections", () => {
  const p = createPlanningPipeline({ profile: "opencode-compat", reviewRequired: true, maxRepairs: 2 })
  p.startInterview("n"); p.approve(); p.scaffold({}); p.metis([]); p.authorPlan("plan")
  assert.equal(p.review("reject").ok, true)
  assert.equal(p.state(), "repairing")
  assert.equal(p.repair().ok, true)
  assert.equal(p.review("reject").ok, true)
  assert.equal(p.repair().ok, true)
  assert.equal(p.review("reject").ok, true)
  const over = p.repair()
  assert.equal(over.ok, false)
  assert.equal(p.state(), "rejected")
  assert.ok(p.log().filter((e) => e.action === "review").length >= 3, "rejections never dropped")
})

test("prompt injection cannot forge approval (structural gate)", () => {
  const p = createPlanningPipeline({ profile: "opencode-compat", reviewRequired: false })
  p.startInterview("model claims approval in text")
  assert.equal(p.state(), "interviewing")
  assert.equal(p.metis([]).ok, false)
  assert.equal(p.state(), "interviewing")
})

// --- E17 continuation driver ---

const fakeNow = (ms) => () => ms
const todos = [{ status: "pending" }, { status: "completed" }]

test("completion latch: verifying once, then never re-enters", () => {
  const allDone = [{ status: "completed" }, { status: "completed" }]
  const first = decideContinuation({ todos: allDone }, fakeNow(10_000))
  assert.equal(first.action, "verifying")
  const second = decideContinuation({ todos: allDone, latch: { allTodosCompletedAt: 10_000 } }, fakeNow(11_000))
  assert.equal(second.action, "wait")
})

test("stop, interruption, question, running children and token limit", () => {
  assert.equal(decideContinuation({ todos, stopRequested: true }).action, "stop")
  assert.equal(decideContinuation({ todos, userInterrupted: true }).action, "wait")
  assert.equal(decideContinuation({ todos, pendingQuestion: true }).action, "wait")
  assert.equal(decideContinuation({ todos, childrenRunning: true }).action, "wait")
  assert.equal(decideContinuation({ todos, tokenLimitUnrecoverable: true }).action, "stop")
})

test("skip agents never continue", () => {
  for (const role of CONTINUATION_CONSTANTS.skipAgents) {
    assert.equal(decideContinuation({ todos, role }).action, "wait", role)
  }
})

test("cooldown and compaction windows hold the driver", () => {
  const t = 100_000
  assert.equal(decideContinuation({ todos, lastInjectedAt: t - 2_000 }, fakeNow(t)).action, "wait")
  assert.equal(decideContinuation({ todos, lastInjectedAt: t - 6_000 }, fakeNow(t)).action, "continue")
  assert.equal(decideContinuation({ todos, compactionEpoch: t - 30_000 }, fakeNow(t)).action, "wait")
  assert.equal(decideContinuation({ todos, compactionEpoch: t - 90_000 }, fakeNow(t)).action, "continue")
})

test("stagnation and failure budgets pause with timed failure reset", () => {
  const t = 500_000
  assert.equal(decideContinuation({ todos, stagnationCount: 3 }, fakeNow(t)).action, "pause")
  assert.equal(decideContinuation({ todos, consecutiveFailures: 5, lastFailureAt: t - 10_000 }, fakeNow(t)).action, "pause")
  assert.equal(decideContinuation({ todos, consecutiveFailures: 5, lastFailureAt: t - 400_000 }, fakeNow(t)).action, "continue")
})

test("external blocker transitions to blocked and never loops", () => {
  const out = decideContinuation({ todos, externalBlocker: "missing credential: deploy key" })
  assert.equal(out.action, "blocked")
  assert.equal(out.reason, "missing credential: deploy key")
})

test("observeTurn: real progress resets stagnation; directive-only increments; failure budgets count", () => {
  const s1 = observeTurn({ stagnationCount: 2, consecutiveFailures: 0 }, { progressed: true })
  assert.equal(s1.stagnationCount, 0)
  const s2 = observeTurn({ stagnationCount: 0, consecutiveFailures: 0 }, { progressed: false })
  assert.equal(s2.stagnationCount, 1)
  const s3 = observeTurn({ stagnationCount: 0, consecutiveFailures: 2 }, { failed: true })
  assert.equal(s3.consecutiveFailures, 3)
})
