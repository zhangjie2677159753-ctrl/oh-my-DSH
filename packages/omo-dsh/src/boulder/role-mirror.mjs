// omo-dsh Boulder role mirror (ADR-R16 cross-restart authority), pure part.
// The role snapshot mirrored to a workspace file is the accepted fallback
// authority when the stock persistence refuses to restore unknown event
// types (see docs/plans/ADR-R16-BOULDER-FALLBACK.md). Format is owned and
// versioned; unknown versions fail closed on read.

export const ROLE_MIRROR_SCHEMA_VERSION = 1

export function buildRoleMirror({ role, revision, changedBy = "user", reason = "", changedAt = new Date().toISOString() } = {}) {
  if (typeof role !== "string" || role.length === 0) throw new TypeError("role: required non-empty string")
  if (!Number.isInteger(revision) || revision < 1) throw new TypeError("revision: expected positive integer")
  return {
    schemaVersion: ROLE_MIRROR_SCHEMA_VERSION,
    role,
    revision,
    changedBy,
    reason: String(reason).slice(0, 200),
    changedAt,
  }
}

/**
 * Parse a stored mirror text. Fail closed: unsupported schema version,
 * invalid JSON, or an invalid snapshot refuse interpretation — never guess.
 */
export function parseRoleMirror(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { status: "missing" }
  }
  let mirror
  try {
    mirror = JSON.parse(text)
  } catch {
    return { status: "corrupt", reason: "invalid JSON" }
  }
  if (mirror === null || typeof mirror !== "object" || mirror.schemaVersion !== ROLE_MIRROR_SCHEMA_VERSION) {
    return { status: "unsupported-version", schemaVersion: mirror?.schemaVersion ?? null }
  }
  if (typeof mirror.role !== "string" || mirror.role.length === 0
    || !Number.isInteger(mirror.revision) || mirror.revision < 1
    || typeof mirror.changedAt !== "string") {
    return { status: "invalid", reason: "role/revision/changedAt malformed" }
  }
  return { status: "ok", mirror }
}

/** Reconciliation rule from the ADR: the session log (append-only authority)
 *  wins over the mirror; mirror revision is only accepted when the log
 *  cannot be restored (no role events at all). */
export function reconcileRoleMirror({ logRole, mirror }) {
  if (logRole !== null) {
    return { authority: "session-log", role: logRole, mirrorStale: mirror !== null && mirror.revision !== logRole.revision }
  }
  if (mirror !== null) {
    return { authority: "boulder-mirror", role: { role: mirror.role, revision: mirror.revision }, mirrorStale: false }
  }
  return { authority: "none", role: null, mirrorStale: false }
}
