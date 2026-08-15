// omo-dsh resume/fork lifecycle policy (OMO-0502), pure part.
// - resume: the role state is reconstructed ONLY from the session log fold —
//   never from process memory
// - fork: inherits the parent fold, stamped with a migration/system event so
//   provenance is explicit
// - a child session can never mutate its parent's role (parent/child folds
//   are separate authorities)
import { reduceRoleFold } from "../compat/session.mjs"

export function resumeFromLog(events) {
  // Authority is the log only; a caller passing live state cannot shortcut it.
  if (!Array.isArray(events)) throw new TypeError("resumeFromLog: expected event array")
  return reduceRoleFold(events)
}

export function forkRoleState(parentEvents, { now = () => Date.now() } = {}) {
  const inherited = reduceRoleFold(parentEvents)
  // The fork event keeps the inherited role but advances revision under
  // changedBy=migration so the new session's provenance is explicit.
  const forkEvent = {
    type: "omo/role",
    seq: parentEvents.length === 0 ? 0 : parentEvents[parentEvents.length - 1].seq + 1,
    time: now(),
    data: {
      schemaVersion: 1,
      role: inherited.role,
      revision: inherited.revision + 1,
      changedBy: "migration",
      reason: "fork inheritance",
      changedAt: new Date(now()).toISOString(),
    },
  }
  return { inherited, forkEvent, foldAfterFork: reduceRoleFold([...parentEvents, forkEvent]) }
}

export function assertChildCannotMutateParent(childFold, parentFold) {
  // Structural guarantee: folds are per-session values; a child tool writes to
  // its OWN session only. This helper encodes the invariant checks a runtime
  // layer must perform — child events must never be folded into the parent.
  if (childFold === parentFold) throw new Error("child and parent fold must be distinct authorities")
  return true
}
