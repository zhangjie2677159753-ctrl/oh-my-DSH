// omo-dsh client projection builder, pure part (OMO-0207).
// Projections are derived read-models over Host state; they carry owned DTOs
// only (lossless JSON, no live Cordis/DSH objects). Cold reads rebuild from
// the session log fold — never from process memory.
import { isLosslessJsonValue } from "./session.mjs"

export function derivePhase(work) {
  if (!work) return "normal"
  switch (work.status) {
    case "active": return "executing"
    case "completed": return "normal"
    case "paused": return "blocked"
    case "abandoned": return "normal"
    default: throw new TypeError(`derivePhase: unknown work status ${JSON.stringify(work.status)}`)
  }
}

export function buildSessionProjection({ roleState, work = null, activeChildren = 0, continuation = {}, latestVerification = null, phaseOverride = null }) {
  // Inputs must be owned DTOs: a live handle passed as context must fail here
  // instead of being silently dropped from the projection.
  for (const [label, value] of [["roleState", roleState], ["work", work], ["continuation", continuation], ["latestVerification", latestVerification]]) {
    if (value !== null && value !== undefined && !isLosslessJsonValue(value)) {
      throw new TypeError(`buildSessionProjection: ${label} must be an owned lossless-JSON DTO`)
    }
  }
  // undefined-valued keys are not lossless JSON — omit them instead.
  const projection = {
    role: { name: roleState.role, revision: roleState.revision },
    phase: phaseOverride ?? derivePhase(work),
    ...(work ? {
      work: { id: work.id, planName: work.planName, completed: work.completed, total: work.total },
    } : {}),
    activeChildren,
    continuation: { status: continuation.status ?? "idle", attempts: continuation.attempts ?? 0 },
    ...(latestVerification ? {
      latestVerification: { status: latestVerification.status, at: latestVerification.at },
    } : {}),
  }
  if (!isLosslessJsonValue(projection)) {
    throw new TypeError("buildSessionProjection: projection must be an owned lossless-JSON DTO (live objects are forbidden)")
  }
  return Object.freeze(projection)
}

/** Cold rebuild: fold role events, then project. */
export function projectFromRoleEvents(events, options = {}) {
  // reduceRoleFold lives in session.mjs; re-export style import avoided here
  // to keep the compat module graph explicit. Callers pass a folded state.
  const { reduceRoleFold } = options
  const roleState = reduceRoleFold(events)
  return buildSessionProjection({ roleState, ...options })
}
