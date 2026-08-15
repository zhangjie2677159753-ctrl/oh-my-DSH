// omo-dsh session adapter, pure part (OMO-0201).
// Owned DTOs + strict lossless-JSON validation + role fold. Real DSH
// `@deepseek-ai/dsh-session` integration (append/flush/event subscription)
// attaches here later; every function below must stay side-effect free.
//
// Envelope contract mirrors @deepseek-ai/dsh-session SessionEvent (fixed SHA):
//   { type, seq, time, data, ignorable? }
// - seq: monotonic within the session
// - ignorable absent => required: unknown required events MUST refuse reconstruction
// - data payload must be lossless JSON (finite numbers, no -0, plain objects)

export const PRIMARY_ROLES = Object.freeze(["sisyphus", "hephaestus", "prometheus", "atlas"])
export const ROLE_CHANGED_BY = Object.freeze(["user", "start-work", "system", "migration"])

// --- lossless-JSON guard (mirrors dsh-session/json isJsonValue semantics) ---

export function isLosslessJsonValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0)
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false
    return value.every((v) => isLosslessJsonValue(v))
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.values(value).every((v) => isLosslessJsonValue(v))
  }
  return false
}

export function assertLosslessJsonValue(value, path = "value") {
  if (!isLosslessJsonValue(value)) {
    throw new TypeError(`${path}: not a lossless JSON value (live objects, -0, non-finite numbers, functions and class instances are forbidden)`)
  }
  return value
}

// --- owned role DTO (omo/role v1) ---

export function initialRoleState() {
  return Object.freeze({
    schemaVersion: 1,
    role: "sisyphus",
    revision: 0,
    changedBy: "system",
    reason: "initial",
    changedAt: "",
  })
}

const SNAPSHOT_KEYS = Object.freeze(["schemaVersion", "role", "revision", "changedBy", "reason", "changedAt"])

export function validateRoleSnapshot(snapshot, path = "omo/role") {
  const errors = []
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [`${path}: expected object`]
  }
  for (const key of Object.keys(snapshot)) {
    if (!SNAPSHOT_KEYS.includes(key)) errors.push(`${path}.${key}: unknown key`)
  }
  if (snapshot.schemaVersion !== 1) errors.push(`${path}.schemaVersion: expected 1`)
  if (!PRIMARY_ROLES.includes(snapshot.role)) errors.push(`${path}.role: expected one of ${PRIMARY_ROLES.join("|")}`)
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) errors.push(`${path}.revision: expected positive integer`)
  if (!ROLE_CHANGED_BY.includes(snapshot.changedBy)) errors.push(`${path}.changedBy: expected one of ${ROLE_CHANGED_BY.join("|")}`)
  if (typeof snapshot.reason !== "string" || snapshot.reason.length === 0 || snapshot.reason.length > 200) {
    errors.push(`${path}.reason: expected non-empty string <= 200 chars`)
  }
  if (typeof snapshot.changedAt !== "string") errors.push(`${path}.changedAt: expected string`)
  return errors
}

// --- event decode policy ---

/**
 * Decode one DSH session event into an owned result.
 * - unknown type with `ignorable` => { skipped: true }
 * - unknown type without `ignorable` => error (fail closed)
 * - known type => payload validated strictly
 */
export function decodeSessionEvent(event) {
  assertLosslessJsonValue(event, "event")
  if (typeof event.type !== "string" || event.type.length === 0) throw new TypeError("event.type: expected non-empty string")
  if (!Number.isInteger(event.seq) || event.seq < 0) throw new TypeError(`event.seq: expected non-negative integer`)
  if (!Number.isFinite(event.time)) throw new TypeError("event.time: expected finite number")
  if (event.type === "omo/role") {
    const errors = validateRoleSnapshot(event.data)
    if (errors.length > 0) throw new TypeError(errors.join("; "))
    return { skipped: false, kind: "omo/role", snapshot: event.data, seq: event.seq }
  }
  if (event.ignorable === true) return { skipped: true, kind: "ignorable", type: event.type, seq: event.seq }
  throw new TypeError(`event.type "${event.type}": unknown required event (refusing reconstruction)`)
}

// --- history/live merge with seq de-dup ---

export function dedupeBySeq(events) {
  const seen = new Set()
  const out = []
  for (const event of events) {
    if (seen.has(event.seq)) continue
    seen.add(event.seq)
    out.push(event)
  }
  return out
}

/**
 * Fold role state over an ordered, de-duplicated event list.
 * Fails on revision regression (stale write) so prompt/model/guard all read
 * one monotonic authority.
 */
export function reduceRoleFold(events, start = initialRoleState()) {
  let state = start
  let lastSeq = -1
  for (const event of events) {
    if (event.seq <= lastSeq) throw new TypeError(`event seq ${event.seq}: must be strictly increasing (input must be de-duplicated)`)
    lastSeq = event.seq
    // Decode every event so unknown-required records refuse reconstruction
    // even when they do not affect the role fold itself.
    const decoded = decodeSessionEvent(event)
    if (decoded.kind !== "omo/role") continue
    const snapshot = decoded.snapshot
    if (snapshot.revision <= state.revision) {
      throw new TypeError(`omo/role revision ${snapshot.revision}: stale write (current ${state.revision})`)
    }
    state = Object.freeze({ ...snapshot })
  }
  return state
}
