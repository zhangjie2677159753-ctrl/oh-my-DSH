// omo-dsh routing adapter, pure part (OMO-0204).
// Models DSH seams: `agent/request` (route waterfall) and `agent/request-error`
// (recovery seam). OMO runtime fallback keeps its own bounded state machine.
// Hard rules encoded here:
// - retry/fallback only for inference failures; tool side effects are never
//   replayed (the machine has no tool state and only re-invokes inference)
// - capability mismatch never silently degrades: skip or fail loudly
// - auth/policy/schema/capability/context/refusal are terminal, no blind
//   cross-provider fan-out
// - fallback to a new route binds a new prompt family (no stale variant)

export function classifyRequestError(error) {
  const msg = String(error?.message ?? error ?? "").toLowerCase()
  const code = error?.code
  if (code === "rate_limit" || /429|rate.?limit|quota|too many requests/i.test(msg)) {
    return { class: "rate-limit", retryable: true, crossProvider: true }
  }
  if (code === "auth" || /401|403|unauthorized|forbidden|invalid api key|credential|authentication/i.test(msg)) {
    return { class: "auth", retryable: false, crossProvider: false }
  }
  if (/context|maximum context|input too long|token limit|too many tokens|reduce the length/i.test(msg)) {
    return { class: "context", retryable: false, crossProvider: false }
  }
  if (/invalid schema|schema for function|400/i.test(msg)) {
    return { class: "schema", retryable: false, crossProvider: false }
  }
  if (/capabilit|not supported|does not support|no vision/i.test(msg)) {
    return { class: "capability", retryable: false, crossProvider: true }
  }
  if (/policy|content filter|guardrail|moderation/i.test(msg)) {
    return { class: "policy", retryable: false, crossProvider: false }
  }
  if (/refus|declined|i cannot/i.test(msg)) {
    return { class: "refusal", retryable: false, crossProvider: false }
  }
  if (/timeout|timed out|econnreset|connection reset|503|502|overloaded|transient|temporar/i.test(msg)) {
    return { class: "transient", retryable: true, crossProvider: true }
  }
  if (/500|internal server error|bad gateway/i.test(msg)) {
    return { class: "server", retryable: true, crossProvider: true }
  }
  return { class: "unknown", retryable: false, crossProvider: false }
}

const TERMINAL_CLASSES = new Set(["auth", "policy", "schema", "capability", "context", "refusal", "unknown"])

export function createFallbackMachine({ routes, maxAttemptsPerRoute = 2, requiredCapabilities = [] }) {
  const attempts = new Map()
  const log = []
  const openedCircuits = new Set()
  let promptFamilyBinding = null

  function routeUsable(route, step) {
    if (openedCircuits.has(route.id)) return false
    for (const cap of requiredCapabilities) {
      if (!route.capabilities.includes(cap)) {
        log.push({ step, route: route.id, event: "capability-skip", missing: cap })
        return false
      }
    }
    return (attempts.get(route.id) ?? 0) < maxAttemptsPerRoute
  }

  /**
   * Run one inference attempt through the fallback chain.
   * @param step unique step id (one per model inference)
   * @param run (routeId) => Promise|sync result — inference only, never tools
   */
  async function attempt(step, run) {
    for (const route of routes) {
      if (!routeUsable(route, step)) continue
      attempts.set(route.id, (attempts.get(route.id) ?? 0) + 1)
      promptFamilyBinding = route.promptFamily
      log.push({ step, route: route.id, event: "attempt", attemptNo: attempts.get(route.id), promptFamily: route.promptFamily })
      try {
        const result = await run(route.id)
        return { status: "ok", routeId: route.id, promptFamily: route.promptFamily, result, log: [...log] }
      } catch (error) {
        const classified = classifyRequestError(error)
        log.push({ step, route: route.id, event: "error", class: classified.class, retryable: classified.retryable })
        if (TERMINAL_CLASSES.has(classified.class)) {
          return { status: "terminal", reason: classified.class, routeId: route.id, message: error?.message ?? String(error), log: [...log] }
        }
        // transient/rate-limit/server: continue down the chain (or retry same route on next step)
        continue
      }
    }
    return { status: "exhausted", log: [...log] }
  }

  function openCircuit(routeId) {
    openedCircuits.add(routeId)
  }

  function state() {
    return Object.freeze({
      attempts: Object.fromEntries(attempts),
      circuits: [...openedCircuits],
      promptFamilyBinding,
      log: [...log],
    })
  }

  return { attempt, openCircuit, state }
}
