import { test } from "node:test"
import assert from "node:assert/strict"
import {
  TASK_LIFECYCLE_STEPS,
  QUEUED_PREFIX_STEP,
  INTERRUPT_LIFECYCLE_STEPS,
  planTaskExecution,
  planInterruptExecution,
  buildSettlementRecord,
} from "../src/tasks/orchestration.mjs"
import { createChildBudget } from "../src/tasks/concurrency.mjs"
import { settlementToNotification } from "../src/children/notification.mjs"

test("lifecycle step order is frozen", () => {
  assert.deepEqual(TASK_LIFECYCLE_STEPS, [
    "acquire-slot", "build-request", "launch", "await-settle", "release-slot", "record-notification",
  ])
  assert.equal(QUEUED_PREFIX_STEP, "wait-slot")
  assert.deepEqual(INTERRUPT_LIFECYCLE_STEPS, ["build-interrupt-request", "interrupt", "assert-post-state"])
})

test("planTaskExecution grants and walks the full lifecycle", () => {
  const budget = createChildBudget({ maxActiveChildren: 2 })
  const plan = planTaskExecution({ descriptor: { id: "c1", role: "explore" }, budget })
  assert.equal(plan.ok, true)
  assert.equal(plan.queued, false)
  assert.deepEqual(plan.steps.map((s) => s.step), [...TASK_LIFECYCLE_STEPS])
  assert.equal(plan.slot.granted, true)
  assert.equal(budget.state().active, 1)
})

test("planTaskExecution queues with wait-slot prefix when at capacity", () => {
  const budget = createChildBudget({ maxActiveChildren: 1 })
  planTaskExecution({ descriptor: { id: "c1" }, budget })
  const plan = planTaskExecution({ descriptor: { id: "c2" }, budget })
  assert.equal(plan.ok, true)
  assert.equal(plan.queued, true)
  assert.deepEqual(plan.steps.map((s) => s.step), [QUEUED_PREFIX_STEP, ...TASK_LIFECYCLE_STEPS])
  assert.equal(budget.state().queued, 1)
})

test("planTaskExecution refuses when the queue is full (no silent drop)", () => {
  const budget = createChildBudget({ maxActiveChildren: 1, maxQueueSize: 1 })
  planTaskExecution({ descriptor: { id: "c1" }, budget })
  planTaskExecution({ descriptor: { id: "c2" }, budget })
  const refused = planTaskExecution({ descriptor: { id: "c3" }, budget })
  assert.equal(refused.ok, false)
  assert.ok(refused.reason.includes("queue full"))
})

test("planTaskExecution refuses terminal descriptors and malformed budgets", () => {
  const terminal = planTaskExecution({ descriptor: { id: "c", status: "failed" } })
  assert.equal(terminal.ok, false)
  const badBudget = planTaskExecution({ descriptor: { id: "c" }, budget: {} })
  assert.equal(badBudget.ok, false)
})

test("planInterruptExecution refuses terminal children", () => {
  assert.equal(planInterruptExecution({ child: null }).ok, false)
  assert.equal(planInterruptExecution({ child: { id: "c", status: "stopped" } }).ok, false)
  const ok = planInterruptExecution({ child: { id: "c", status: "running" } })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.steps.map((s) => s.step), [...INTERRUPT_LIFECYCLE_STEPS])
})

test("buildSettlementRecord maps settled statuses to notification payloads", () => {
  const ok = buildSettlementRecord({ settled: { status: "ok", result: {} }, childRole: "explore", childSessionId: "s1", slot: {} })
  assert.equal(ok.ok, true)
  assert.equal(ok.notification.ok, true)
  assert.equal(ok.releaseSlot, true)
  // feeds settlementToNotification end-to-end
  const ev = settlementToNotification(ok.notification)
  assert.equal(ev.status, "completed")
  assert.equal(ev.childRole, "explore")

  const cancelled = buildSettlementRecord({ settled: { status: "cancelled", sideEffectsPossible: true }, childRole: "explore", childSessionId: "s2" })
  assert.equal(cancelled.ok, true)
  assert.equal(cancelled.notification.ok, false)
  assert.equal(cancelled.sideEffectsPossible, true)
  const ev2 = settlementToNotification(cancelled.notification)
  assert.equal(ev2.status, "failed")
  assert.equal(ev2.summary, "cancelled")
})

test("buildSettlementRecord refuses unsettled or unknown settlements", () => {
  assert.equal(buildSettlementRecord({ settled: null }).ok, false)
  assert.equal(buildSettlementRecord({ settled: { status: "weird" } }).ok, false)
})

test("budget release returns the slot for the next queued child", () => {
  const budget = createChildBudget({ maxActiveChildren: 1 })
  planTaskExecution({ descriptor: { id: "c1" }, budget })
  planTaskExecution({ descriptor: { id: "c2" }, budget })
  const release = budget.release("c1")
  assert.equal(release.nextGranted, "c2")
  assert.equal(budget.state().active, 1)
})
