// omo-dsh goal/todo adapter, pure part (OMO-0206).
// DSH facts honored at fixed SHA:
// - Goal: durable `goal/change` events with id+revision CAS; activation is
//   process-local and replay/resume leaves the goal DISARMED. Only a direct
//   top-level human resume may rearm it — the OMO driver never auto-rearms.
// - Todo: `todo/write` is a whole-list last-write-wins log snapshot, not a
//   project database. Boulder stays the project authority; the todo list is
//   only the current session's work view.

export const GOAL_ACTIONS = Object.freeze(["create", "edit", "pause", "resume", "complete", "blocked"])

export function validateGoalChange(change) {
  const errors = []
  if (change === null || typeof change !== "object" || Array.isArray(change)) return ["goal/change: expected object"]
  if (typeof change.goalId !== "string" || change.goalId.length === 0) errors.push("goalId: expected non-empty string")
  if (!Number.isInteger(change.revision) || change.revision < 1) errors.push("revision: expected positive integer")
  if (!GOAL_ACTIONS.includes(change.action)) errors.push(`action: expected one of ${GOAL_ACTIONS.join("|")}`)
  if (change.action === "blocked" && typeof change.blockedReason !== "string") errors.push("blockedReason: required for blocked action")
  return errors
}

export function initialGoalState() {
  return Object.freeze({ armed: false, goalId: null, revision: 0, phase: "none", blockedReason: undefined })
}

/**
 * Apply one goal/change event to the state.
 * - revision must be exactly current+1 (CAS)
 * - replay/re-application of an old revision fails closed
 * - activation (armed) is process-local: a new process/fold starts disarmed
 */
export function applyGoalChange(state, change) {
  const errors = validateGoalChange(change)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  if (state.goalId !== null && change.goalId !== state.goalId) {
    throw new TypeError(`goalId ${change.goalId}: one goal per session view`)
  }
  if (change.revision !== state.revision + 1) {
    throw new TypeError(`goal revision ${change.revision}: expected ${state.revision + 1} (CAS)`)
  }
  const next = {
    goalId: change.goalId,
    revision: change.revision,
    phase: change.action,
    blockedReason: change.action === "blocked" ? change.blockedReason : undefined,
    // armed is process-local activation: only an explicit human resume sets it,
    // and it never survives replay/fork/session-start.
    armed: change.action === "resume" ? false : state.armed,
  }
  return Object.freeze(next)
}

/** Fold a fresh process over goal events: state reconstructs but stays disarmed. */
export function foldGoalEvents(events) {
  let state = initialGoalState()
  for (const event of events) {
    if (event.type === "goal/change") state = applyGoalChange(state, event.data)
  }
  return state
}

export function humanResume(state) {
  if (state.phase !== "paused" && state.phase !== "blocked") {
    throw new TypeError(`humanResume: cannot resume from phase ${state.phase}`)
  }
  return Object.freeze({ ...state, armed: true })
}

// --- todo projection from the Boulder plan (session view only) ---

/**
 * Compute the whole-list todo snapshot for the current session from the next
 * incomplete top-level task of a plan. Never copy the whole project into todos.
 * Returns null when the desired snapshot equals the current one (no write).
 */
export function projectNextTaskTodo(plan, currentTodo = null) {
  if (plan === null || typeof plan !== "object" || !Array.isArray(plan.tasks)) {
    throw new TypeError("plan: expected object with tasks array")
  }
  const next = plan.tasks.find((t) => t.status !== "completed")
  if (!next) return { items: [], changed: currentTodo !== null && currentTodo.length !== 0 ? true : false }
  const items = [{ content: next.title ?? next.content, status: next.status === "in_progress" ? "in_progress" : "pending" }]
  const same = currentTodo !== null
    && currentTodo.length === items.length
    && currentTodo[0].content === items[0].content
    && currentTodo[0].status === items[0].status
  return { items, changed: !same }
}

/**
 * Reconcile a completed todo item back to Boulder and recompute the session
 * view. Returns the next whole-list snapshot plus which plan task completed.
 */
export function reconcileTodoCompletion(plan, completedContent) {
  const task = plan.tasks.find((t) => (t.title ?? t.content) === completedContent && t.status !== "completed")
  if (!task) throw new TypeError(`no open plan task matches ${JSON.stringify(completedContent)}`)
  const nextPlan = { ...plan, tasks: plan.tasks.map((t) => (t === task ? { ...t, status: "completed" } : t)) }
  return { plan: nextPlan, todo: projectNextTaskTodo(nextPlan, [{ content: completedContent, status: "completed" }]) }
}
