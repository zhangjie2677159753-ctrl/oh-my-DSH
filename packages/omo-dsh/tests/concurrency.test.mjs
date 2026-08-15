import test from "node:test"
import assert from "node:assert/strict"
import { createChildBudget, createWriterLease, createSettlement } from "../src/tasks/concurrency.mjs"

test("child budget: cap enforced, FIFO queue, release wakes next", () => {
  const budget = createChildBudget({ maxActiveChildren: 2, maxQueueSize: 2 })
  assert.equal(budget.acquire("a").granted, true)
  assert.equal(budget.acquire("b").granted, true)
  const c = budget.acquire("c")
  assert.equal(c.granted, false)
  assert.equal(c.queued, true)
  assert.equal(budget.acquire("d").granted, false)
  const overflow = budget.acquire("e")
  assert.equal(overflow.granted, false)
  assert.equal(overflow.reason, "queue-full")
  assert.deepEqual(budget.state(), { active: 2, queued: 2 })

  const released = budget.release("a")
  assert.equal(released.nextGranted, "c")
  assert.deepEqual(budget.state(), { active: 2, queued: 1 })
})

test("child budget: releasing a queued waiter before grant removes it", () => {
  const budget = createChildBudget({ maxActiveChildren: 1 })
  budget.acquire("a")
  budget.acquire("b")
  assert.equal(budget.release("b").released, false)
  assert.deepEqual(budget.state(), { active: 1, queued: 0 })
  assert.equal(budget.release("a").nextGranted, null)
})

test("writer lease: single holder, stale lease id rejected", () => {
  const lease = createWriterLease()
  const first = lease.acquire("w1")
  assert.equal(first.granted, true)
  const second = lease.acquire("w2")
  assert.equal(second.granted, false)
  assert.equal(second.holder, "w1")
  assert.throws(() => lease.release("w2", first.leaseId), /held by/)
  assert.throws(() => lease.release("w1", first.leaseId + 1), /stale/)
  assert.equal(lease.release("w1", first.leaseId).released, true)
  assert.equal(lease.acquire("w2").granted, true)
})

test("settlement race: cancel before settle wins, after settle is a no-op", () => {
  const s = createSettlement()
  assert.equal(s.cancel("user stop").applied, true)
  const outcome = s.settle("result")
  assert.equal(outcome.status, "cancelled")
  assert.equal(outcome.sideEffectsPossible, true)

  const s2 = createSettlement()
  const settled = s2.settle("result")
  assert.equal(settled.status, "ok")
  const late = s2.cancel("too late")
  assert.equal(late.applied, false)
  assert.throws(() => s2.settle("again"), /already settled/)
})
