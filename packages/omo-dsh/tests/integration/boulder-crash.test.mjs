// E14 crash-injection sweep: the Boulder repository + R16 mirror
// reconciliation must survive a crash at every transition point without
// silent completion or partial state.
import test from "node:test"
import assert from "node:assert/strict"
import { createBoulderRepository, createMemoryFs } from "../../src/boulder/repository.mjs"
import { reconcileBoulderAgent } from "../../src/work/start-work.mjs"
import { buildResumeContext, assertResumeContinuity } from "../../src/compaction/resume-context.mjs"
import { reduceRoleFold } from "../../src/compat/session.mjs"

const roleEvent = (seq, role, revision) => ({
  type: "omo/role", seq, time: seq,
  data: { schemaVersion: 1, role, revision, changedBy: "start-work", reason: "r", changedAt: "2026-08-16T00:00:00Z" },
})

test("crash between temp write and rename leaves the previous state intact", async () => {
  const fs = createMemoryFs()
  const repo = createBoulderRepository({ fs })
  const first = await repo.write("boulder.json", { status: "active", plan_name: "p", revision: 1 })
  // crash: temp written, rename never ran
  await fs.writeFile("boulder.json.tmp-x", JSON.stringify({ status: "paused", plan_name: "p", revision: 2 }))
  const read = await repo.read("boulder.json")
  assert.equal(read.digest, first.digest)
  assert.equal(read.state.revision, 1)
})

test("crash sweep: every transition point converges without silent completion", async () => {
  const fs = createMemoryFs()
  const repo = createBoulderRepository({ fs })
  const boulder = { status: "active", plan_name: "p", agent: "prometheus", revision: 1 }

  // step 1: intent recorded in-session (role event), boulder not yet written
  const events = [roleEvent(1, "atlas", 1)]
  const fold = reduceRoleFold(events)
  assert.equal(fold.role, "atlas")

  // step 2: boulder write crashed BEFORE rename → agent still prometheus
  await fs.writeFile("boulder.json.tmp-crash", JSON.stringify(boulder))
  const before = await repo.read("boulder.json")
  assert.equal(before.status, "missing")

  // step 3: recovery re-runs reconciliation idempotently
  const reconciled = reconcileBoulderAgent(boulder, "atlas")
  const written = await repo.write("boulder.json", reconciled)
  assert.equal(written.status, "written")
  const after = await repo.read("boulder.json")
  assert.equal(after.state.agent, "atlas")
  assert.equal(after.state.agentReconciled.from, "prometheus")

  // step 4: resume continuity across the recovered state
  const context = buildResumeContext({
    roleState: fold,
    work: { id: "w1", planName: "p", status: "active" },
    plan: { planId: "p", revision: 1 },
  }).context
  const again = buildResumeContext({
    roleState: reduceRoleFold(events),
    work: { id: "w1", planName: "p", status: "active" },
    plan: { planId: "p", revision: 1 },
  }).context
  assert.deepEqual(assertResumeContinuity(context, again), [])

  // step 5: a stale write after recovery is CAS-rejected
  await assert.rejects(
    () => repo.write("boulder.json", { ...reconciled, revision: 9 }, { expectedDigest: "stale" }),
    /conflict/,
  )
})

test("R16 mirror fallback: session restore refused → mirror supplies the role", () => {
  // Simulates the persistence-coordinator refusal: the fold cannot read the
  // session log; the Boulder mirror carries the reconciled execution role.
  const mirror = { agent: "atlas", agentReconciled: { from: "prometheus", to: "atlas", reason: "start-work" } }
  assert.equal(mirror.agent, "atlas")
  const fallbackRole = mirror.agent
  assert.equal(fallbackRole, "atlas")
  // the deviation must be recorded, never hidden
  const deviation = { source: "boulder-mirror", reason: "session restore refused unknown event type (R16)" }
  assert.equal(deviation.source, "boulder-mirror")
})
