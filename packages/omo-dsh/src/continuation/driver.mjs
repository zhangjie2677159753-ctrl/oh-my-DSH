// omo-dsh continuation decision driver (E17), pure part.
// Verified fixed-SHA constants:
//   countdown 2000ms, abort window 3000ms, cooldown 5000ms,
//   compaction guard 60000ms, max stagnation 3, max consecutive failures 5,
//   failure reset window 300000ms, skip agents [prometheus, compaction, plan].
export const CONTINUATION_CONSTANTS = Object.freeze({
  countdownMs: 2_000,
  abortWindowMs: 3_000,
  cooldownMs: 5_000,
  compactionGuardMs: 60_000,
  maxStagnation: 3,
  maxConsecutiveFailures: 5,
  failureResetWindowMs: 5 * 60 * 1000,
  skipAgents: Object.freeze(["prometheus", "compaction", "plan"]),
})

export const STOP_REASONS = Object.freeze({
  userInterrupt: "user-interruption",
  pendingQuestion: "pending-question",
  childRunning: "children-running",
  cooldown: "cooldown-active",
  compaction: "compaction-window",
  stopRequested: "stop-requested",
  tokenLimit: "token-limit-unrecoverable",
  stagnation: "stagnation-limit",
  failureBudget: "failure-budget",
  externalBlocker: "external-blocker",
})

/**
 * Decide the next continuation action for one idle event.
 * All inputs come from durable state; `now` is injectable for fake clocks.
 * Returns { action, reason } where action is one of:
 *   continue | verifying | wait | pause | stop | blocked
 */
export function decideContinuation(input, now = () => Date.now()) {
  const t = now()
  const c = CONTINUATION_CONSTANTS
  const {
    role,
    todos = [],
    stopRequested = false,
    userInterrupted = false,
    pendingQuestion = false,
    childrenRunning = false,
    externalBlocker = null,
    tokenLimitUnrecoverable = false,
    consecutiveFailures = 0,
    stagnationCount = 0,
    lastInjectedAt = null,
    lastFailureAt = null,
    compactionEpoch = null,
    latch = { allTodosCompletedAt: null },
  } = input

  if (c.skipAgents.includes(role)) return { action: "wait", reason: `agent ${role} skips continuation` }

  // completion latch: all-complete already observed → never re-enter
  if (latch.allTodosCompletedAt !== null && latch.allTodosCompletedAt !== undefined) {
    return { action: "wait", reason: "all todos already completed (latch)" }
  }
  const incomplete = todos.filter((item) => item.status !== "completed").length
  if (todos.length > 0 && incomplete === 0) {
    return { action: "verifying", reason: "all todos complete — final verification required before done" }
  }
  if (todos.length === 0) return { action: "wait", reason: "no todos" }

  if (stopRequested) return { action: "stop", reason: STOP_REASONS.stopRequested }
  if (userInterrupted) return { action: "wait", reason: STOP_REASONS.userInterrupt }
  if (pendingQuestion) return { action: "wait", reason: STOP_REASONS.pendingQuestion }
  // rechecked immediately before dispatch per upstream contract
  if (childrenRunning) return { action: "wait", reason: STOP_REASONS.childRunning }
  if (externalBlocker !== null && externalBlocker !== undefined) {
    return { action: "blocked", reason: externalBlocker }
  }
  if (tokenLimitUnrecoverable) return { action: "stop", reason: STOP_REASONS.tokenLimit }

  // failure budget with timed reset
  let failures = consecutiveFailures
  const sinceFailure = lastFailureAt === null ? Infinity : t - lastFailureAt
  if (sinceFailure >= c.failureResetWindowMs) failures = 0
  if (failures >= c.maxConsecutiveFailures) {
    return { action: "pause", reason: STOP_REASONS.failureBudget }
  }

  if (stagnationCount >= c.maxStagnation) return { action: "pause", reason: STOP_REASONS.stagnation }

  if (lastInjectedAt !== null && t - lastInjectedAt < c.cooldownMs) {
    return { action: "wait", reason: STOP_REASONS.cooldown }
  }

  if (compactionEpoch !== null && t - compactionEpoch < c.compactionGuardMs) {
    return { action: "wait", reason: STOP_REASONS.compaction }
  }

  return { action: "continue", reason: "ready", countdownMs: c.countdownMs, abortWindowMs: c.abortWindowMs }
}

/**
 * Observe a settled turn and update the durable counters. A turn with real
 * progress resets stagnation; a directive-only response (no todo progress)
 * increments it.
 */
export function observeTurn(state, { progressed, failed }) {
  const next = { ...state }
  if (failed) {
    next.consecutiveFailures = (state.consecutiveFailures ?? 0) + 1
    next.lastFailureAt = Date.now()
    return next
  }
  next.stagnationCount = progressed ? 0 : (state.stagnationCount ?? 0) + 1
  next.lastInjectedAt = Date.now()
  next.lastFailureAt = null
  return next
}
