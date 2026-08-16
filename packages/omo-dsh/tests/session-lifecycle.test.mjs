import { test } from "node:test"
import assert from "node:assert/strict"
import {
  END_SEED_TYPE,
  appendSeedMarker,
  locateLastEndSeed,
  firstLiveSeq,
  commitThenNotify,
  createAnnounceGuard,
  createAppendGuard,
} from "../src/compat/session-lifecycle.mjs"

// --- CT-04 seed replay ---

test("appendSeedMarker appends once and skips re-marking", () => {
  const mk = (type, data) => ({ type, data, seq: 1 })
  const r1 = appendSeedMarker([], mk)
  assert.equal(r1.appended, true)
  assert.equal(r1.events[0].type, END_SEED_TYPE)
  const r2 = appendSeedMarker(r1.events, mk)
  assert.equal(r2.appended, false)
  assert.equal(r2.events.length, 1)
})

test("locateLastEndSeed returns the LAST marker, not the first", () => {
  const events = [
    { type: END_SEED_TYPE, seq: 0 },
    { type: "user/message", seq: 1 },
    { type: END_SEED_TYPE, seq: 2 },
    { type: "assistant/message", seq: 3 },
  ]
  assert.equal(locateLastEndSeed(events), 2)
  assert.equal(locateLastEndSeed([{ type: "user/message" }]), -1)
})

test("firstLiveSeq validates and returns the seed length", () => {
  assert.equal(firstLiveSeq(0), 0)
  assert.equal(firstLiveSeq(5), 5)
  assert.throws(() => firstLiveSeq(-1), /non-negative/)
})

// --- CT-05 observer containment ---

test("commitThenNotify commits even when every observer throws", () => {
  const logs = []
  const { committed, observerErrors, allObserversRan } = commitThenNotify({
    commit: () => ({ seq: 7 }),
    observers: [
      () => { throw new Error("boom-1") },
      (evt) => { if (evt.seq !== 7) throw new Error("wrong event") },
      () => { throw new Error("boom-2") },
    ],
    log: (m) => logs.push(m),
  })
  assert.deepEqual(committed, { seq: 7 })
  assert.deepEqual(observerErrors, ["boom-1", "boom-2"])
  assert.equal(allObserversRan, true)
  assert.equal(logs.length, 2)
})

// --- CT-06 reentrant refusal ---

test("announce guard refuses double and reentrant announce", () => {
  const guard = createAnnounceGuard({ sessionId: "s1" })
  let reentrantError = null
  guard.announce(() => {
    try { guard.announce(() => {}) } catch (e) { reentrantError = e.message }
  })
  assert.match(reentrantError, /already announced/)
  assert.throws(() => guard.announce(() => {}), /already announced/)
  assert.equal(guard.state().announced, true)
})

test("append guard refuses nested append from within an observer", () => {
  const guard = createAppendGuard({ sessionId: "s1" })
  let nestedError = null
  guard.append(() => {
    try { guard.append(() => {}) } catch (e) { nestedError = e.message }
    return { seq: 1 }
  })
  assert.match(nestedError, /reentrant append refused/)
  // sequential appends are fine
  assert.deepEqual(guard.append(() => ({ seq: 2 })), { seq: 2 })
})
