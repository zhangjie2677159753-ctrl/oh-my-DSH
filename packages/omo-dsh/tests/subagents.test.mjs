import test from "node:test"
import assert from "node:assert/strict"
import {
  validateSubagentCapabilities,
  assertSubagentLaunch,
  assertContinuableLaunch,
  makeDescriptor,
  assertDurableDescriptor,
  assertProcessLocalDescriptor,
  resolveColdContinuation,
  SEND_MESSAGE_SEMANTICS,
  INTERRUPT_SEMANTICS,
  simulateInterrupt,
} from "../src/compat/subagents.mjs"

const fullProvider = { id: "in-process", capabilities: ["outputSchema", "depthLimit", "toolFilter", "persona", "continuable"] }
const acpProvider = { id: "acp", capabilities: [] }

test("capability validation fails loudly before launch", () => {
  assert.deepEqual(validateSubagentCapabilities(fullProvider, { outputSchema: { type: "object" } }), [])
  assert.deepEqual(validateSubagentCapabilities(acpProvider, { outputSchema: { type: "object" } }), ["outputSchema"])
  assert.throws(() => assertSubagentLaunch(acpProvider, { outputSchema: {} }), /lacks: outputSchema/)
  assert.throws(() => validateSubagentCapabilities(acpProvider, { magic: true }), /unknown/)
})

test("continuable outputSchema is rejected (fixed DSH contract)", () => {
  const provider = { id: "in-process", capabilities: ["outputSchema", "depthLimit", "toolFilter", "persona", "continuable"] }
  assert.throws(
    () => assertContinuableLaunch(provider, { outputSchema: { type: "object" } }),
    /does not support outputSchema/,
  )
  assert.doesNotThrow(() => assertContinuableLaunch(provider, { persona: "explore" }))
})

test("descriptor kinds are enforced and never interchangeable", () => {
  const job = makeDescriptor({ kind: "job", id: "job-1", parentSessionId: "ses-a", role: "explore" })
  const child = makeDescriptor({ kind: "continuable-session", id: "ses-b", parentSessionId: "ses-a", role: "explore" })
  assert.throws(() => assertDurableDescriptor(job, "task_send"), /process-local/)
  assert.doesNotThrow(() => assertDurableDescriptor(child, "task_send"))
  assert.throws(() => assertProcessLocalDescriptor(child, "task_cancel"), /durable/)
  assert.doesNotThrow(() => assertProcessLocalDescriptor(job, "task_cancel"))
  assert.throws(() => makeDescriptor({ kind: "wat", id: "x", parentSessionId: "y" }), /job\|continuable-session/)
})

test("cold restart never pretends a live turn survives", () => {
  assert.equal(resolveColdContinuation({ provider: fullProvider, hasLiveActivation: true, canReactivate: false, canStartNewTurn: false }), "reactivate")
  assert.equal(resolveColdContinuation({ provider: fullProvider, hasLiveActivation: false, canReactivate: true, canStartNewTurn: true }), "new-turn")
  assert.equal(resolveColdContinuation({ provider: fullProvider, hasLiveActivation: false, canReactivate: false, canStartNewTurn: false }), "lost")
  assert.equal(resolveColdContinuation({ provider: acpProvider, hasLiveActivation: false, canReactivate: false, canStartNewTurn: false }), "unsupported")
})

test("send and interrupt semantics match the fixed DSH contract", () => {
  assert.equal(SEND_MESSAGE_SEMANTICS.queuedAsNextTurn, true)
  assert.equal(SEND_MESSAGE_SEMANTICS.cannotRedirectActiveTurn, true)
  const interrupted = simulateInterrupt({ running: true, inbox: 3 })
  assert.equal(interrupted.cancelsCurrentTurn, true)
  assert.equal(interrupted.preservesInbox, true)
  assert.equal(interrupted.deletesChild, false)
  assert.equal(interrupted.cancelsDescendants, false)
  assert.equal(interrupted.child.running, false)
  assert.equal(interrupted.child.inbox, 3)
  assert.equal(INTERRUPT_SEMANTICS.cancelsDescendants, false)
})
