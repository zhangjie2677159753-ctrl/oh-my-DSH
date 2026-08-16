import { test } from "node:test"
import assert from "node:assert/strict"
import { createInbox } from "../src/compat/inbox.mjs"

test("followup queues an ordinary turn and wakes the driver (sole owner)", () => {
  const inbox = createInbox()
  inbox.followup("m1")
  let s = inbox.snapshot()
  assert.equal(s.driverState, "running")
  assert.deepEqual(s.ordinary, ["m1"])
  // a followup item is the SOLE ordinary message of its own turn
  inbox.followup("m2")
  assert.equal(inbox.snapshot().ordinary.length, 2)
  s = inbox.turnEnded()
  assert.deepEqual(s.ordinary, ["m2"])
  s = inbox.turnEnded()
  assert.equal(s.driverState, "idle")
})

test("steer wakes an idle driver and is consumed at the next step boundary", () => {
  const inbox = createInbox()
  inbox.steer("s1")
  assert.equal(inbox.snapshot().driverState, "running")
  const { claimed } = inbox.stepBoundary()
  assert.deepEqual(claimed.steering, ["s1"])
  assert.equal(inbox.snapshot().steering.length, 0)
})

test("inject never wakes; a running driver claims it at a later boundary", () => {
  const inbox = createInbox()
  inbox.inject("ctx1")
  assert.equal(inbox.snapshot().driverState, "idle")
  assert.equal(inbox.snapshot().injected.length, 1)
  // followup wakes the driver, then the injected context is claimed
  inbox.followup("m1")
  const { claimed } = inbox.stepBoundary()
  assert.deepEqual(claimed.injected, ["ctx1"])
  assert.deepEqual(claimed.steering, [])
})

test("rejected step parks steering until the next wake but consumed inject is not replayed", () => {
  const inbox = createInbox()
  inbox.followup("m1")
  inbox.steer("s1")
  inbox.inject("ctx1")
  inbox.stepBoundary({ accept: false })
  let s = inbox.snapshot()
  assert.deepEqual(s.steering, ["s1"]) // parked
  assert.deepEqual(s.injected, []) // claimed batch may miss per DSH clause
  // next wake -> next boundary claims the parked steering
  inbox.followup("m2")
  const { claimed } = inbox.stepBoundary()
  assert.deepEqual(claimed.steering, ["s1"])
})

test("cancel discards pending steering/inject unless keepInbox", () => {
  const inbox = createInbox()
  inbox.followup("m1")
  inbox.steer("s1")
  inbox.inject("ctx1")
  const s = inbox.cancel()
  assert.deepEqual(s.steering, [])
  assert.deepEqual(s.injected, [])
  assert.deepEqual(s.ordinary, ["m1"]) // queued turns kept

  const inbox2 = createInbox()
  inbox2.followup("m1")
  inbox2.steer("s1")
  inbox2.inject("ctx1")
  const s2 = inbox2.cancel({ keepInbox: true })
  assert.deepEqual(s2.steering, ["s1"])
  assert.deepEqual(s2.injected, ["ctx1"])
})

test("wake while idle always opens a turn boundary even with a cleared message", () => {
  const inbox = createInbox()
  const s = inbox.wakeWhileIdle(null)
  assert.equal(s.driverState, "running")
  assert.equal(s.ordinary.length, 0) // cleared message: boundary still opened
})
