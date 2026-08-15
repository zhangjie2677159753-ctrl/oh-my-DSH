import test from "node:test"
import assert from "node:assert/strict"
import { reconcileDescriptors, classifyOrphan } from "../src/tasks/reconciler.mjs"
import { buildResumeContext, assertResumeContinuity } from "../src/compaction/resume-context.mjs"

const provider = { id: "in-process", capabilities: ["continuable"] }

test("restart: process-local jobs are lost, never fake-running", () => {
  const results = reconcileDescriptors({
    descriptors: [{ kind: "job", id: "job-1", parentSessionId: "p1" }],
    liveJobs: new Set(),
    liveSessions: new Set(),
    parents: new Set(["p1"]),
    provider,
  })
  assert.deepEqual(results[0], { id: "job-1", status: "lost", kind: "job", note: "process-local job: restart means terminal/lost" })
})

test("continuable child with parent and live session resolves reactivate", () => {
  const results = reconcileDescriptors({
    descriptors: [{ kind: "continuable-session", id: "ses-c", parentSessionId: "p1" }],
    liveJobs: new Set(),
    liveSessions: new Set(["ses-c"]),
    parents: new Set(["p1"]),
    provider,
  })
  assert.equal(results[0].status, "reactivate")
})

test("continuable child without live activation resolves new-turn or lost by provider", () => {
  const resumable = reconcileDescriptors({
    descriptors: [{ kind: "continuable-session", id: "ses-c", parentSessionId: "p1" }],
    liveSessions: new Set(), parents: new Set(["p1"]), provider,
  })
  assert.equal(resumable[0].status, "new-turn")

  const lost = reconcileDescriptors({
    descriptors: [{ kind: "continuable-session", id: "ses-c", parentSessionId: "p1" }],
    liveSessions: new Set(), parents: new Set(["p1"]),
    provider: { id: "acp", capabilities: [] },
  })
  assert.equal(lost[0].status, "unsupported")
})

test("orphan detection and attach/cancel/lost policy", () => {
  const results = reconcileDescriptors({
    descriptors: [{ kind: "continuable-session", id: "ses-c", parentSessionId: "ghost" }],
    parents: new Set(["p1"]), provider,
  })
  assert.equal(results[0].status, "orphan")
  const orphan = results[0]
  assert.deepEqual(classifyOrphan(orphan, { parentExists: true, providerSupportsContinuable: true }), { action: "attach", orphan })
  assert.equal(classifyOrphan(orphan, { parentExists: true, providerSupportsContinuable: false }).action, "cancel")
  assert.equal(classifyOrphan(orphan, { parentExists: false, providerSupportsContinuable: true }).action, "lost")
})

// --- resume context ---

const roleState = { role: "atlas", revision: 4 }

test("resume context is minimal owned JSON with budget enforcement", () => {
  const { context, approximateTokens } = buildResumeContext({
    roleState,
    work: { id: "w1", planName: "plan-a", status: "active", revision: 2 },
    plan: { planId: "plan-1", revision: 1, digest: "d1" },
    nextTask: { key: "todo:2", title: "Second task" },
    recentEvidence: [{ key: "todo:1", command: "node --test", exitCode: 0, at: 1 }],
    blockers: [],
  })
  assert.equal(context.role.name, "atlas")
  assert.equal(context.nextTask.key, "todo:2")
  assert.ok(approximateTokens < 8000)
  assert.throws(() => buildResumeContext({ roleState, recentEvidence: [{ live: new Map() }] }), /lossless JSON/)
})

test("continuity asserts role/work/plan survive compaction", () => {
  const a = buildResumeContext({ roleState, work: { id: "w1", planName: "p", status: "active" }, plan: { planId: "p1", revision: 1 } }).context
  const same = buildResumeContext({ roleState, work: { id: "w1", planName: "p", status: "active" }, plan: { planId: "p1", revision: 2 } }).context
  assert.deepEqual(assertResumeContinuity(a, same), [])

  const wrongRole = buildResumeContext({ roleState: { role: "prometheus", revision: 1 }, work: { id: "w1", planName: "p", status: "active" } }).context
  assert.ok(assertResumeContinuity(a, wrongRole).some((e) => e.includes("role changed")))

  const wrongWork = buildResumeContext({ roleState, work: { id: "w2", planName: "q", status: "active" } }).context
  assert.ok(assertResumeContinuity(a, wrongWork).some((e) => e.includes("work changed")))
})
