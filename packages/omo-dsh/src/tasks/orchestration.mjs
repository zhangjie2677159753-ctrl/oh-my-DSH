// omo-dsh task orchestration step-plan (G7/E09 pure half), pure part.
// The DSH binding walks these steps; this module owns the ORDER and the
// fail-fast decisions so the runtime glue stays thin.
//   launch path (granted): acquire-slot → build-request → launch →
//                          await-settle → release-slot → record-notification
//   launch path (queued):  wait-slot → (granted steps)
//   interrupt path:        build-interrupt-request → interrupt → assert-post-state
// Fail-fast: queue-full refuses the plan (no silent drop); a terminal child
// refuses interrupt/send plans. createChildBudget FIFO semantics are honored:
// queued is a legitimate wait state, only queue-full is a refusal.

export const TASK_LIFECYCLE_STEPS = Object.freeze([
  "acquire-slot",
  "build-request",
  "launch",
  "await-settle",
  "release-slot",
  "record-notification",
])

export const QUEUED_PREFIX_STEP = "wait-slot"

export const INTERRUPT_LIFECYCLE_STEPS = Object.freeze([
  "build-interrupt-request",
  "interrupt",
  "assert-post-state",
])

/**
 * Plan a task launch against a createChildBudget() instance.
 * Returns { ok, steps, slot } or { ok:false, reason }.
 */
export function planTaskExecution({ descriptor, budget = null, now = () => Date.now() }) {
  const errors = []
  if (!descriptor || typeof descriptor.id !== "string" || descriptor.id.length === 0) {
    errors.push("descriptor.id: required")
  }
  if (descriptor?.status && ["completed", "failed", "stopped"].includes(descriptor.status)) {
    errors.push(`descriptor ${descriptor.id}: terminal; launch refused`)
  }
  if (errors.length > 0) return { ok: false, reason: errors.join("; "), steps: [] }

  let slot = null
  let queued = false
  if (budget) {
    if (typeof budget.acquire !== "function") {
      return { ok: false, reason: "budget: missing acquire()", steps: [] }
    }
    slot = budget.acquire(descriptor.id)
    if (slot.reason === "queue-full") {
      return { ok: false, reason: "child budget queue full; task refused (no silent drop)", steps: [] }
    }
    queued = slot.queued === true
  }

  const steps = []
  if (queued) steps.push(QUEUED_PREFIX_STEP)
  steps.push(...TASK_LIFECYCLE_STEPS)
  return {
    ok: true,
    queued,
    steps: Object.freeze(steps.map((step) => ({ step, at: now() }))),
    slot, // { granted:true, id } | { granted:false, queued:true, id } | null
  }
}

/**
 * Plan an interrupt. Refuses terminal children loudly (interrupt is not
 * stop). The expected post-state travels in the request DTO built by
 * tasks/control.mjs buildInterruptRequest.
 */
export function planInterruptExecution({ child, now = () => Date.now() }) {
  if (!child || typeof child.id !== "string" || child.id.length === 0) {
    return { ok: false, reason: "child.id: required", steps: [] }
  }
  if (child.status && ["completed", "failed", "stopped"].includes(child.status)) {
    return { ok: false, reason: `child ${child.id}: terminal; interrupt refused`, steps: [] }
  }
  return {
    ok: true,
    steps: Object.freeze(INTERRUPT_LIFECYCLE_STEPS.map((step) => ({ step, at: now() }))),
  }
}

/**
 * Compose the settlement record: a createSettlement()-settled record →
 * notification payload (children/notification.mjs settlementToNotification
 * consumes it) plus the slot-release instruction. Unsettled or malformed
 * settlement refuses the record.
 */
export function buildSettlementRecord({ settled, childRole = "", childSessionId = null, slot = null }) {
  if (!settled || typeof settled.status !== "string") {
    return { ok: false, reason: "settlement unsettled; record refused", notification: null, releaseSlot: false }
  }
  if (settled.status === "ok") {
    return {
      ok: true,
      notification: { childRole, childSessionId, ok: true, error: null },
      releaseSlot: slot !== null && slot !== undefined,
      sideEffectsPossible: false,
    }
  }
  if (settled.status === "cancelled") {
    return {
      ok: true,
      notification: { childRole, childSessionId, ok: false, error: "cancelled" },
      releaseSlot: slot !== null && slot !== undefined,
      sideEffectsPossible: settled.sideEffectsPossible === true,
    }
  }
  return { ok: false, reason: `unknown settlement status ${settled.status}`, notification: null, releaseSlot: false }
}
