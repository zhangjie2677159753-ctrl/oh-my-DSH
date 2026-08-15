import test from "node:test"
import assert from "node:assert/strict"
import { assessRollbackTrigger, createRollbackRunner, ROLLBACK_STEPS, reconstructTimeline } from "../src/release/rollback.mjs"
import { createStateMigrator } from "../src/migration/state-migrator.mjs"

// --- E31 rollback ---

test("trigger classification covers all nine release blockers", () => {
  for (const kind of Object.keys(ROLLBACK_TRIGGERS)) {
    const assessment = assessRollbackTrigger([{ kind }])
    assert.equal(assessment.trigger, true, kind)
  }
  assert.equal(assessRollbackTrigger([{ kind: "unrelated" }]).trigger, false)
})

test("rollback runner executes the fixed step order and stops on residual resources", async () => {
  const order = []
  const ops = Object.fromEntries(ROLLBACK_STEPS.map((step) => [step, async () => {
    order.push(step)
    return step === "verify-residuals" ? { residuals: 0 } : {}
  }]))
  const runner = createRollbackRunner({ ops })
  const outcome = await runner.run({ trigger: "false-success" })
  assert.equal(outcome.ok, true)
  assert.deepEqual(order, [...ROLLBACK_STEPS])
})

test("rollback stops at the failing step and records evidence", async () => {
  const ops = Object.fromEntries(ROLLBACK_STEPS.map((step) => [step, async () => {
    if (step === "restore-backup") throw new Error("backup missing")
    return {}
  }]))
  const runner = createRollbackRunner({ ops })
  const outcome = await runner.run({ trigger: "secret-leak" })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.phase, "restore-backup")
  assert.ok(outcome.evidence.some((e) => e.step === "restore-backup" && e.ok === false))
})

test("residual resources block completion", async () => {
  const ops = Object.fromEntries(ROLLBACK_STEPS.map((step) => [step, async () => (step === "verify-residuals" ? { residuals: 3 } : {})]))
  const outcome = await createRollbackRunner({ ops }).run({ trigger: "unmount-leak" })
  assert.equal(outcome.ok, false)
  assert.ok(outcome.reason.includes("3"))
})

test("timeline reconstruction sorts by time", () => {
  const timeline = reconstructTimeline([
    { at: 30, kind: "restore", detail: "b" },
    { at: 10, kind: "trigger", detail: "a" },
    { at: 20, kind: "kill", detail: "c" },
  ])
  assert.deepEqual(timeline.map((r) => r.at), [10, 20, 30])
})

// --- E29 state migration ---

const migrations = [
  { from: 1, to: 2, handlesActiveWork: true, migrate: (s) => ({ ...s, schemaVersion: 2, migrated: true }) },
  { from: 2, to: 3, handlesActiveWork: true, migrate: (s) => ({ ...s, schemaVersion: 3 }) },
]

test("versioned chain migrates with per-step backups and stable digest", async () => {
  const migrator = createStateMigrator({ migrations, currentVersion: 1 })
  const backups = []
  const a = await migrator.migrate({ value: "x" }, 3, { backup: (s) => { backups.push(s); return s } })
  assert.equal(a.ok, true)
  assert.equal(a.version, 3)
  assert.equal(a.state.schemaVersion, 3)
  assert.equal(a.path.length, 2)
  assert.equal(backups.length, 2)

  const b = await createStateMigrator({ migrations, currentVersion: 1 }).migrate({ value: "x" }, 3)
  assert.equal(a.digest, b.digest) // idempotent
})

test("missing migration boundary blocks with the exact version", async () => {
  const migrator = createStateMigrator({ migrations: [migrations[0]], currentVersion: 1 })
  const out = await migrator.migrate({ value: "x" }, 5)
  assert.equal(out.ok, false)
  assert.ok(out.reason.includes("from version 2"))
})

test("active works block a migration that does not handle them", async () => {
  const migrator = createStateMigrator({ migrations: [{ from: 1, to: 2, handlesActiveWork: false, migrate: (s) => s }], currentVersion: 1 })
  const out = await migrator.migrate({ value: "x" }, 2, { activeWorks: [{ id: "w1" }] })
  assert.equal(out.ok, false)
  assert.ok(out.reason.includes("active works"))
})

test("downgrade without a reversible migration is read-only refusal", async () => {
  const migrator = createStateMigrator({ migrations, currentVersion: 3 })
  const out = await migrator.migrate({ value: "x" }, 1)
  assert.equal(out.ok, false)
  assert.equal(out.readOnly, true)
})
