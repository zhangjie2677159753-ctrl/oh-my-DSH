import { test } from "node:test"
import assert from "node:assert/strict"
import {
  TASK_CONTROL_CONTRACT,
  MAX_SEND_MESSAGE_BYTES,
  buildInterruptRequest,
  buildSendRequest,
  expectedPostInterrupt,
  assertNotTerminal,
} from "../src/tasks/control.mjs"

const liveChild = { id: "child-1", role: "explore", status: "running" }

test("control contract locks the fixed DSH interrupt/send/stop semantics", () => {
  assert.equal(TASK_CONTROL_CONTRACT.interrupt.cancelsCurrentTurn, true)
  assert.equal(TASK_CONTROL_CONTRACT.interrupt.preservesInbox, true)
  assert.equal(TASK_CONTROL_CONTRACT.interrupt.cancelsDescendants, false)
  assert.equal(TASK_CONTROL_CONTRACT.interrupt.keepsChildAlive, true)
  assert.equal(TASK_CONTROL_CONTRACT.send.queuesLaterTurn, true)
  assert.equal(TASK_CONTROL_CONTRACT.send.cannotRedirectActiveTurn, true)
  assert.equal(TASK_CONTROL_CONTRACT.stop.terminal, true)
})

test("buildInterruptRequest produces a frozen DTO with the contract embedded", () => {
  const fixed = () => 123
  const { ok, request } = buildInterruptRequest({ child: liveChild, now: fixed })
  assert.equal(ok, true)
  assert.equal(request.kind, "interrupt")
  assert.equal(request.childId, "child-1")
  assert.equal(request.issuedAt, 123)
  assert.equal(request.expected.cancelsCurrentTurn, true)
  assert.ok(Object.isFrozen(request))
  assert.throws(() => { request.childId = "x" }, TypeError)
})

test("buildInterruptRequest refuses terminal children and bad ids", () => {
  assert.equal(buildInterruptRequest({ child: null }).ok, false)
  assert.equal(buildInterruptRequest({ child: { id: "" } }).ok, false)
  for (const status of ["completed", "failed", "stopped"]) {
    const r = buildInterruptRequest({ child: { id: "c", status } })
    assert.equal(r.ok, false)
    assert.ok(r.errors[0].includes("terminal"))
  }
})

test("buildSendRequest validates message and refuses terminal children", () => {
  assert.equal(buildSendRequest({ child: liveChild, message: "  " }).ok, false)
  assert.equal(buildSendRequest({ child: liveChild, message: "x".repeat(MAX_SEND_MESSAGE_BYTES + 1) }).ok, false)
  const ok = buildSendRequest({ child: liveChild, message: "resume with step 2" })
  assert.equal(ok.ok, true)
  assert.equal(ok.request.expected.cannotRedirectActiveTurn, true)
})

test("expectedPostInterrupt records every live-probe assertion", () => {
  const exp = expectedPostInterrupt({ child: liveChild })
  assert.deepEqual(
    { childAlive: exp.childAlive, inboxPreserved: exp.inboxPreserved, descendantsPreserved: exp.descendantsPreserved, liveTurnCancelled: exp.liveTurnCancelled, resumable: exp.resumable },
    { childAlive: true, inboxPreserved: true, descendantsPreserved: true, liveTurnCancelled: true, resumable: true },
  )
  assert.ok(Object.isFrozen(exp))
})

test("assertNotTerminal throws on terminal children only", () => {
  assert.equal(assertNotTerminal("send", liveChild), liveChild)
  assert.throws(() => assertNotTerminal("send", { id: "c", status: "completed" }), /terminal/)
})
