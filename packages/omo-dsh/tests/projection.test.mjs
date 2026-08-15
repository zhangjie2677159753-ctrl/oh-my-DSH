import test from "node:test"
import assert from "node:assert/strict"
import { buildSessionProjection, derivePhase, projectFromRoleEvents } from "../src/compat/projection.mjs"
import { reduceRoleFold, initialRoleState } from "../src/compat/session.mjs"

test("derivePhase maps Boulder work statuses", () => {
  assert.equal(derivePhase(null), "normal")
  assert.equal(derivePhase({ status: "active" }), "executing")
  assert.equal(derivePhase({ status: "completed" }), "normal")
  assert.equal(derivePhase({ status: "paused" }), "blocked")
  assert.equal(derivePhase({ status: "abandoned" }), "normal")
  assert.throws(() => derivePhase({ status: "wat" }), /unknown work status/)
})

test("projection is a frozen owned DTO", () => {
  const projection = buildSessionProjection({
    roleState: { role: "atlas", revision: 3 },
    work: { id: "w1", planName: "plan-a", completed: 2, total: 5, status: "active" },
    activeChildren: 1,
    continuation: { status: "running", attempts: 2 },
    latestVerification: { status: "passed", at: "2026-08-15T12:00:00Z" },
  })
  assert.equal(projection.phase, "executing")
  assert.equal(projection.work.completed, 2)
  assert.equal(projection.continuation.attempts, 2)
  assert.ok(Object.isFrozen(projection))
})

test("live DSH objects cannot enter a projection", () => {
  assert.throws(
    () => buildSessionProjection({ roleState: initialRoleState(), continuation: { status: "running", handle: new Map() } }),
    /lossless-JSON/,
  )
})

test("cold rebuild folds the role log first", () => {
  const events = [
    { type: "omo/role", seq: 1, time: 1, data: { schemaVersion: 1, role: "prometheus", revision: 1, changedBy: "user", reason: "plan", changedAt: "2026-08-15T12:00:00Z" } },
  ]
  const projection = projectFromRoleEvents(events, { reduceRoleFold })
  assert.equal(projection.role.name, "prometheus")
  assert.equal(projection.role.revision, 1)
  assert.equal(projection.phase, "normal")
})
