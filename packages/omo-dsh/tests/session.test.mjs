import test from "node:test"
import assert from "node:assert/strict"
import {
  isLosslessJsonValue,
  assertLosslessJsonValue,
  validateRoleSnapshot,
  decodeSessionEvent,
  dedupeBySeq,
  reduceRoleFold,
  initialRoleState,
  assertNoLegacyHeaderDelta,
} from "../src/compat/session.mjs"

// --- lossless JSON guard ---

test("lossless JSON accepts plain values", () => {
  for (const v of [null, true, "x", 1, 1.5, [], [1, "a"], {}, { a: { b: [1] } }, Object.create(null)]) {
    assert.equal(isLosslessJsonValue(v), true, JSON.stringify(v))
  }
})

test("lossless JSON rejects live objects and unsafe numbers", () => {
  for (const v of [-0, Infinity, NaN, undefined, () => {}, new Date(0), new Map(), new Uint8Array([1])]) {
    assert.equal(isLosslessJsonValue(v), false, String(v))
  }
  assert.throws(() => assertLosslessJsonValue({ session: new Map() }), /lossless JSON/)
})

// --- role snapshot validation ---

const validSnapshot = {
  schemaVersion: 1,
  role: "atlas",
  revision: 3,
  changedBy: "start-work",
  reason: "plan approved",
  changedAt: "2026-08-15T12:00:00.000Z",
}

test("valid role snapshot passes", () => {
  assert.deepEqual(validateRoleSnapshot(validSnapshot), [])
})

test("role snapshot rejects unknown keys and bad fields", () => {
  assert.ok(validateRoleSnapshot({ ...validSnapshot, extra: 1 }).some((e) => e.includes("unknown key")))
  assert.ok(validateRoleSnapshot({ ...validSnapshot, role: "atlas-junior" }).some((e) => e.includes("role")))
  assert.ok(validateRoleSnapshot({ ...validSnapshot, revision: 0 }).some((e) => e.includes("revision")))
  assert.ok(validateRoleSnapshot({ ...validSnapshot, revision: 1.5 }).some((e) => e.includes("revision")))
  assert.ok(validateRoleSnapshot({ ...validSnapshot, changedBy: "robot" }).some((e) => e.includes("changedBy")))
  assert.ok(validateRoleSnapshot({ ...validSnapshot, reason: "" }).some((e) => e.includes("reason")))
  assert.ok(validateRoleSnapshot(null).length > 0)
})

// --- decode policy ---

function roleEvent(seq, revision, extra = {}) {
  return { type: "omo/role", seq, time: 1000 + seq, data: { ...validSnapshot, revision, ...extra } }
}

test("decode known omo/role event", () => {
  const out = decodeSessionEvent(roleEvent(1, 2))
  assert.equal(out.kind, "omo/role")
  assert.equal(out.snapshot.revision, 2)
})

test("unknown ignorable event is skipped, unknown required event refuses", () => {
  const ignorable = decodeSessionEvent({ type: "future/info", seq: 1, time: 1, data: {}, ignorable: true })
  assert.equal(ignorable.skipped, true)
  assert.throws(
    () => decodeSessionEvent({ type: "future/required", seq: 1, time: 1, data: {} }),
    /unknown required event/,
  )
})

test("decode rejects malformed envelope and live objects", () => {
  assert.throws(() => decodeSessionEvent(roleEvent(1, 2, { reason: new Date() })), /lossless JSON/)
  assert.throws(() => decodeSessionEvent({ type: "omo/role", seq: -1, time: 1, data: validSnapshot }), /seq/)
  assert.throws(() => decodeSessionEvent(roleEvent(1, 2, { role: "nope" })), /role/)
})

// --- de-dup and fold ---

test("dedupeBySeq drops same-seq duplicates preserving order", () => {
  const e1 = roleEvent(1, 1)
  const e2 = roleEvent(2, 2)
  const out = dedupeBySeq([e1, e1, e2, e1])
  assert.deepEqual(out.map((e) => e.seq), [1, 2])
})

test("fold: empty starts as default sisyphus", () => {
  const state = reduceRoleFold([])
  assert.equal(state.role, "sisyphus")
  assert.equal(state.revision, 0)
})

test("fold: last-wins with monotonic revisions", () => {
  const state = reduceRoleFold([roleEvent(1, 1), { type: "future/info", seq: 2, time: 2, data: {}, ignorable: true }, roleEvent(3, 4)])
  assert.equal(state.role, "atlas")
  assert.equal(state.revision, 4)
})

test("fold: stale revision write fails closed", () => {
  assert.throws(() => reduceRoleFold([roleEvent(1, 5), roleEvent(2, 3)]), /stale write/)
})

test("fold: non-monotonic seq fails (caller must de-dupe first)", () => {
  assert.throws(() => reduceRoleFold([roleEvent(2, 1), roleEvent(1, 2)]), /strictly increasing/)
})

test("fold: unknown required event refuses reconstruction mid-replay", () => {
  assert.throws(
    () => reduceRoleFold([roleEvent(1, 1), { type: "future/required", seq: 2, time: 2, data: {} }]),
    /unknown required event/,
  )
})

// --- CT-12: legacy request/header-delta rejection ---

test("decodeSessionEvent rejects legacy request/header-delta with the DSH-mirrored error", () => {
  assert.throws(
    () => decodeSessionEvent({ type: "request/header-delta", seq: 3, time: 1, data: { delta: {} } }),
    /unsupported legacy request\/header-delta format \(seq 3\)/,
  )
})

test("reduceRoleFold refuses reconstruction when the log contains legacy header-delta", () => {
  assert.throws(
    () => reduceRoleFold([{ type: "request/header-delta", seq: 1, time: 1, data: {} }]),
    /unsupported legacy request\/header-delta/,
  )
})

test("assertNoLegacyHeaderDelta batch guard fails at the first hit", () => {
  const clean = [{ type: "user/message", seq: 0, time: 0 }]
  assert.equal(assertNoLegacyHeaderDelta(clean), clean)
  assert.throws(
    () => assertNoLegacyHeaderDelta([clean[0], { type: "request/header-delta", seq: 1, time: 1, data: {} }]),
    /seq 1/,
  )
})
