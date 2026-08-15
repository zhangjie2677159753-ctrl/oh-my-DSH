// omo-dsh tool pipeline adapter, pure part (OMO-0203).
// Models the DSH tools contract at fixed SHA:
// - tools/pre-execute: ordered waterfall; each hook may rewrite args or deny
// - ctx.tools.guard(): monotonic — a deny can never be overridden by a later allow
// - tools/post-execute: accept / replace / enhance / block the normalized result
// - cancellation is cooperative: same-process code cannot be hard-killed, so a
//   cancelled token surfaces as a cancelled outcome and never hides that side
//   effects up to the last checkpoint may already have happened.

export class CooperativeCancelled extends Error {
  constructor(reason = "cancelled") {
    super(`cooperative cancellation at checkpoint: ${reason}`)
    this.name = "CooperativeCancelled"
  }
}

export function checkpoint(cancelToken) {
  if (cancelToken?.cancelled) throw new CooperativeCancelled(cancelToken.reason)
}

function isDenied(state) {
  return state.deny !== undefined
}

/**
 * Run one tool invocation through the full adapter pipeline.
 * @returns {{ status: 'ok'|'denied'|'blocked'|'cancelled'|'error', result?, reason? }}
 */
export function runToolPipeline({ name, args, preHooks = [], guard, execute, postHooks = [], cancelToken }) {
  const state = { args, deny: undefined }

  // pre-execute waterfall: every hook observes the same evolving input;
  // the FIRST deny wins and later allows cannot resurrect the call.
  for (const hook of preHooks) {
    const decision = hook({ name, args: state.args })
    if (decision?.args !== undefined) state.args = decision.args
    if (decision?.deny !== undefined && state.deny === undefined) state.deny = decision.deny
  }

  // monotonic guard layer
  if (guard) {
    const decision = guard({ name, args: state.args })
    if (decision?.deny !== undefined && state.deny === undefined) state.deny = decision.deny
    // guards may also escalate; escalation is recorded but does not execute
    if (decision?.escalate !== undefined) state.escalate = decision.escalate
  }

  if (isDenied(state)) {
    return { status: "denied", reason: state.deny, args: state.args, escalate: state.escalate }
  }

  let result
  try {
    checkpoint(cancelToken)
    result = execute({ name, args: state.args })
  } catch (error) {
    if (error instanceof CooperativeCancelled) {
      return { status: "cancelled", reason: error.message, sideEffectsPossible: true }
    }
    return { status: "error", reason: error?.message ?? String(error) }
  }

  if (cancelToken?.cancelled) {
    return { status: "cancelled", reason: "cancelled after execution", sideEffectsPossible: true }
  }

  for (const hook of postHooks) {
    const decision = hook({ name, args: state.args, result })
    if (!decision) continue
    if (decision.action === "replace" && decision.result !== undefined) result = decision.result
    if (decision.action === "enhance" && decision.addendum !== undefined) {
      result = typeof result === "string" ? `${result}\n${decision.addendum}` : { ...result, addendum: decision.addendum }
    }
    if (decision.action === "block") return { status: "blocked", reason: decision.reason ?? "blocked by post hook", result }
  }

  return { status: "ok", result, args: state.args }
}

// --- role tool policy registry (startup-validated, monotonic) ---

export function validateToolPolicy(registryNames, policy) {
  const errors = []
  if (!Array.isArray(policy.roles)) errors.push("policy.roles: expected array")
  for (const entry of policy.rules ?? []) {
    for (const tool of [...(entry.allow ?? []), ...(entry.deny ?? [])]) {
      if (!registryNames.includes(tool)) errors.push(`policy: tool "${tool}" not in registry`)
    }
  }
  return errors
}

/**
 * Resolve the decision for (role, tool) from a policy whose rules were
 * startup-validated. `deny` outranks `allow`; escalation is advisory.
 */
export function resolveToolDecision(policy, role, tool) {
  let allowed = false
  let denied = false
  let escalate
  for (const rule of policy.rules ?? []) {
    const applies = rule.roles ? rule.roles.includes(role) : true
    if (!applies) continue
    if ((rule.deny ?? []).includes(tool)) { denied = true; escalate = rule.escalate ?? escalate }
    if ((rule.allow ?? []).includes(tool)) allowed = true
  }
  const decision = denied ? "deny" : allowed ? "allow" : (policy.default ?? "deny")
  return { decision, escalate, role, tool }
}
