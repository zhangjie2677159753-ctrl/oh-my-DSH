// omo-dsh Boulder state adapter (OMO-1401), pure part.
// Verified against packages/boulder-state/src/types.ts at the fixed SHA:
// - v2: schema_version?: 2, active_work_id?, works? — plus legacy/current
//   mirror fields (active_plan, plan_name, status, timestamps, session_ids,
//   session_origins, agent, worktree_path, task_sessions, elapsed).
// - work statuses: active | completed | paused | abandoned
// - task session statuses: running | completed | cancelled
// - origins: direct | appended
// - unknown legacy fields must survive round-trips unchanged.

export const WORK_STATUSES = Object.freeze(["active", "completed", "paused", "abandoned"])
export const TASK_STATUSES = Object.freeze(["running", "completed", "cancelled"])
export const ORIGINS = Object.freeze(["direct", "appended"])

export function normalizeSessionId(id) {
  if (typeof id !== "string" || id.length === 0) throw new TypeError("session id: expected non-empty string")
  return id.startsWith("dsh:") ? id : `dsh:${id}`
}

export function validateBoulderState(state) {
  const errors = []
  if (state === null || typeof state !== "object" || Array.isArray(state)) return ["boulder state: expected object"]
  if (state.schema_version !== undefined && state.schema_version !== 2) {
    errors.push(`schema_version: expected 2 or absent, got ${JSON.stringify(state.schema_version)}`)
  }
  const works = state.works ?? {}
  for (const [id, work] of Object.entries(works)) {
    if (!WORK_STATUSES.includes(work.status)) errors.push(`works.${id}.status: unknown ${JSON.stringify(work.status)}`)
    for (const [taskId, task] of Object.entries(work.task_sessions ?? {})) {
      if (!TASK_STATUSES.includes(task.status)) errors.push(`works.${id}.task_sessions.${taskId}.status: unknown`)
    }
  }
  if (state.active_work_id !== undefined && !(state.active_work_id in works)) {
    errors.push("active_work_id: does not name a work in works")
  }
  return errors
}

/**
 * Round-trip a legacy/current mirror: v2 fields and every unknown legacy field
 * are preserved verbatim; mirror fields stay synchronized.
 */
export function migrateBoulderState(legacy) {
  const errors = validateBoulderState(legacy)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  const out = { ...legacy }
  if (out.schema_version === undefined) out.schema_version = 2
  if (out.works === undefined) {
    const single = {
      id: "work-1",
      status: out.status ?? "active",
      plan_name: out.plan_name ?? null,
      agent: out.agent ?? null,
      session_ids: out.session_ids ?? [],
      session_origins: out.session_origins ?? [],
      worktree_path: out.worktree_path ?? null,
      task_sessions: out.task_sessions ?? {},
      started_at: out.started_at ?? null,
    }
    out.works = { [single.id]: single }
    out.active_work_id = out.active_work_id ?? single.id
  }
  // mirror fields stay readable for legacy consumers
  const active = out.works[out.active_work_id]
  if (active) {
    out.active_plan = active.plan_name
    out.plan_name = active.plan_name
    out.status = active.status
    out.agent = active.agent
    out.session_ids = active.session_ids
    out.session_origins = active.session_origins
    out.worktree_path = active.worktree_path
    out.task_sessions = active.task_sessions
  }
  return out
}

/** Ownership of the task-session link: origins and qualified session ids. */
export function addTaskSession(state, workId, task) {
  if (!state.works?.[workId]) throw new TypeError(`addTaskSession: unknown work ${workId}`)
  const next = structuredClone(state)
  const sessions = next.works[workId].task_sessions ?? {}
  const normalized = normalizeSessionId(task.sessionId)
  sessions[normalized] = {
    ...task,
    sessionId: normalized,
    origin: ORIGINS.includes(task.origin) ? task.origin : "direct",
  }
  next.works[workId].task_sessions = sessions
  next.task_sessions = sessions
  return next
}
