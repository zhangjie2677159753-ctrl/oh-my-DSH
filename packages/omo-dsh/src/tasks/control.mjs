// omo-dsh task control-plane, pure part (CT-16 closure, OMO-0804/E10 half).
// DSH facts honored at fixed SHA:
// - interrupt_agent cancels the CURRENT turn only; the child stays alive,
//   its inbox is preserved (send_message can start a later turn), and its
//   descendants are NOT cancelled
// - send_message queues a LATER turn; it cannot redirect an active turn
// - stopping/killing is a separate, explicit operation (never implied by
//   interrupt)
// This module owns the pure decisions and DTOs; the runtime binding layer
// performs the actual DSH calls and asserts the returned expectations.

export const TASK_CONTROL_CONTRACT = Object.freeze({
  interrupt: Object.freeze({
    cancelsCurrentTurn: true,
    preservesInbox: true,
    cancelsDescendants: false,
    keepsChildAlive: true,
  }),
  send: Object.freeze({
    queuesLaterTurn: true,
    cannotRedirectActiveTurn: true,
  }),
  stop: Object.freeze({
    terminal: true,
    inboxRetainedOnDisk: true,
  }),
})

export const MAX_SEND_MESSAGE_BYTES = 64 * 1024

/**
 * Owned interrupt request DTO for a running child. Rejects terminal
 * descriptors and foreign ids loudly — an interrupt must target a live,
 * known child.
 */
export function buildInterruptRequest({ child, now = () => Date.now() }) {
  const errors = []
  if (!child || typeof child.id !== "string" || child.id.length === 0) {
    errors.push("child.id: required non-empty string")
  }
  if (child?.status && ["completed", "failed", "stopped"].includes(child.status)) {
    errors.push(`child ${child.id}: terminal (${child.status}); interrupt refused`)
  }
  if (errors.length > 0) return { ok: false, errors, request: null }
  return {
    ok: true,
    errors: [],
    request: Object.freeze({
      kind: "interrupt",
      childId: child.id,
      issuedAt: now(),
      expected: { ...TASK_CONTROL_CONTRACT.interrupt },
    }),
  }
}

/**
 * Owned send request DTO. Rejects empty/oversized messages and terminal
 * children; an active turn is NOT redirected (the message parks in the
 * inbox until the current turn settles).
 */
export function buildSendRequest({ child, message, now = () => Date.now() }) {
  const errors = []
  if (!child || typeof child.id !== "string" || child.id.length === 0) {
    errors.push("child.id: required non-empty string")
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    errors.push("message: required non-empty string")
  } else if (Buffer.byteLength(message, "utf8") > MAX_SEND_MESSAGE_BYTES) {
    errors.push(`message: exceeds ${MAX_SEND_MESSAGE_BYTES} bytes`)
  }
  if (child?.status && ["completed", "failed", "stopped"].includes(child.status)) {
    errors.push(`child ${child.id}: terminal (${child.status}); send refused`)
  }
  if (errors.length > 0) return { ok: false, errors, request: null }
  return {
    ok: true,
    errors: [],
    request: Object.freeze({
      kind: "send",
      childId: child.id,
      message,
      issuedAt: now(),
      expected: { ...TASK_CONTROL_CONTRACT.send },
    }),
  }
}

/**
 * Post-interrupt expectation record: what the runtime MUST observe after a
 * successful interrupt. The live probe asserts every field; a mismatch is a
 * contract break, not a soft warning.
 */
export function expectedPostInterrupt({ child }) {
  return Object.freeze({
    childId: child.id,
    childAlive: true,
    inboxPreserved: true,
    descendantsPreserved: true,
    liveTurnCancelled: true,
    resumable: true,
  })
}

/** Reject treating interrupt as stop: distinct operations, distinct DTOs. */
export function assertNotTerminal(operation, child) {
  if (child?.status && ["completed", "failed", "stopped"].includes(child.status)) {
    throw new TypeError(`${operation}: child ${child.id} is terminal (${child.status})`)
  }
  return child
}
