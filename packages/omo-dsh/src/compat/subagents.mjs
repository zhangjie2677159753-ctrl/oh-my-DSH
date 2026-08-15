// omo-dsh subagent adapter, pure part (OMO-0205).
// DSH facts honored at fixed SHA:
// - one-shot start supports outputSchema/depthLimit/toolFilter/persona only
//   when the provider declares them; unsupported must fail loud before launch
// - one-shot background returns a process-local Job ID; a continuable child
//   returns a durable child Session identity (history survives, the live
//   turn/activation does NOT automatically survive a process restart)
// - send_message queues a later turn; interrupt_agent cancels the current
//   turn, preserves the inbox, and deletes neither child nor descendants

export const SUBAGENT_CAPABILITIES = Object.freeze(["outputSchema", "depthLimit", "toolFilter", "persona"])

export function validateSubagentCapabilities(provider, requested = {}) {
  const missing = []
  for (const cap of Object.keys(requested)) {
    if (!SUBAGENT_CAPABILITIES.includes(cap)) {
      throw new TypeError(`subagent capability "${cap}": unknown`)
    }
    if (requested[cap] !== undefined && requested[cap] !== null && requested[cap] !== false) {
      if (!provider.capabilities.includes(cap)) missing.push(cap)
    }
  }
  return missing
}

export function assertSubagentLaunch(provider, requested = {}) {
  const missing = validateSubagentCapabilities(provider, requested)
  if (missing.length > 0) {
    throw new TypeError(`subagent provider "${provider.id}" lacks: ${missing.join(", ")} (fail before launch)`)
  }
  return requested
}

/** Continuable children currently reject outputSchema — fail before launch. */
export function assertContinuableLaunch(provider, requested = {}) {
  assertSubagentLaunch(provider, requested)
  if (requested.outputSchema !== undefined && requested.outputSchema !== null) {
    throw new TypeError("continuable child does not support outputSchema (fixed DSH contract)")
  }
  return requested
}

/**
 * Owned child descriptor. The `kind` distinguishes process-local Jobs from
 * durable continuable Sessions — callers must never treat one as the other.
 */
export function makeDescriptor({ kind, id, parentSessionId, role, category, startedAt }) {
  if (!["job", "continuable-session"].includes(kind)) throw new TypeError(`descriptor kind: expected job|continuable-session`)
  if (typeof id !== "string" || id.length === 0) throw new TypeError("descriptor id: expected non-empty string")
  if (typeof parentSessionId !== "string" || parentSessionId.length === 0) throw new TypeError("descriptor parentSessionId: expected non-empty string")
  return Object.freeze({ kind, id, parentSessionId, role, category, startedAt: startedAt ?? Date.now() })
}

export function assertDurableDescriptor(descriptor, operation) {
  if (descriptor.kind !== "continuable-session") {
    throw new TypeError(`${operation}: ${descriptor.kind} "${descriptor.id}" is process-local and not durable across restarts`)
  }
  return descriptor
}

export function assertProcessLocalDescriptor(descriptor, operation) {
  if (descriptor.kind !== "job") {
    throw new TypeError(`${operation}: ${descriptor.kind} "${descriptor.id}" is durable; treat it as a Session, not a Job`)
  }
  return descriptor
}

/**
 * Cold-restart resolution: durable identity may be discoverable while the
 * live turn is gone. Outcome is one of:
 *   reactivate | new-turn | lost | unsupported
 */
export function resolveColdContinuation({ provider, hasLiveActivation, canReactivate, canStartNewTurn }) {
  if (hasLiveActivation) return "reactivate"
  if (canReactivate) return "new-turn"
  if (canStartNewTurn) return "new-turn"
  if (provider.capabilities.includes("continuable")) return "lost"
  return "unsupported"
}

// send/interrupt semantics as pure facts the runtime layer must honor:
export const SEND_MESSAGE_SEMANTICS = Object.freeze({
  queuedAsNextTurn: true,
  cannotRedirectActiveTurn: true,
})

export const INTERRUPT_SEMANTICS = Object.freeze({
  cancelsCurrentTurn: true,
  preservesInbox: true,
  deletesChild: false,
  cancelsDescendants: false,
})

export function simulateInterrupt(childState = {}) {
  return Object.freeze({
    ...INTERRUPT_SEMANTICS,
    child: { ...childState, running: false },
  })
}
