// Vertical slice (OMO-0301/0302): in-memory DSH seam harness proving the
// Batch A lifecycle — mount → two sessions → role event + flush → independent
// Explore child → stop → resume → unmount — with zero leaked resources.
// This is the contract-level proof; the real-DSH mount run stays an explicit
// deployment gate (see agent-presets/omo/README.md and G1 checklist).
import test from "node:test"
import assert from "node:assert/strict"
import { decodeSessionEvent, dedupeBySeq, reduceRoleFold } from "../../src/compat/session.mjs"
import { makeDescriptor, assertDurableDescriptor } from "../../src/compat/subagents.mjs"

function createSeamHarness() {
  const sessions = new Map()
  let seqCounter = 0
  let flushCount = 0
  let liveListeners = 0
  let timers = 0

  function createSession(id) {
    const session = {
      id,
      events: [],
      flushCount: 0,
      live: [],
    }
    sessions.set(id, session)
    return session
  }

  function append(session, event) {
    const envelope = { seq: ++seqCounter, time: Date.now(), ...event }
    decodeSessionEvent(envelope) // fail closed on unknown required events
    session.events.push(envelope)
    for (const listener of session.live) listener(envelope)
    return envelope
  }

  function flush(session) {
    session.flushCount += 1
    flushCount += 1
  }

  function subscribe(session, listener) {
    liveListeners += 1
    session.live.push(listener)
    return () => {
      liveListeners -= 1
      const index = session.live.indexOf(listener)
      if (index >= 0) session.live.splice(index, 1)
    }
  }

  function setTimer() {
    timers += 1
    return { unref() {}, clear() { timers -= 1 } }
  }

  return {
    sessions, createSession, append, flush, subscribe, setTimer,
    stats: () => ({ sessions: sessions.size, flushCount, liveListeners, timers }),
  }
}

const roleSnapshot = (revision, role = "atlas") => ({
  schemaVersion: 1, role, revision, changedBy: "start-work", reason: "slice", changedAt: "2026-08-15T12:00:00Z",
})

test("vertical slice: full lifecycle with independent child and zero leaks", () => {
  const h = createSeamHarness()

  // mount: preset contributes per-session seams only
  const sesA = h.createSession("ses-a")
  const sesB = h.createSession("ses-b")
  const disposers = []

  // role event in session A, flushed, projected
  h.append(sesA, { type: "omo/role", data: roleSnapshot(1) })
  h.flush(sesA)
  const foldA = reduceRoleFold(dedupeBySeq(sesA.events))
  assert.equal(foldA.role, "atlas")
  assert.equal(sesA.flushCount, 1)

  // session B is untouched: no cross-session leak
  assert.equal(reduceRoleFold(sesB.events).role, "sisyphus")

  // live listener + timer, both disposed later
  const seen = []
  disposers.push(h.subscribe(sesA, (e) => seen.push(e.type)))
  const timer = h.setTimer()

  // child: durable continuable session with its own descriptor
  const child = makeDescriptor({ kind: "continuable-session", id: "ses-child", parentSessionId: "ses-a", role: "explore" })
  assertDurableDescriptor(child, "task_send")
  const sesChild = h.createSession(child.id)
  h.append(sesChild, { type: "omo/role", data: roleSnapshot(1, "sisyphus") })
  // child cannot change parent role
  assert.equal(reduceRoleFold(sesA.events).role, "atlas")

  // live event reached the listener exactly once
  h.append(sesA, { type: "future/info", data: {}, ignorable: true })
  assert.deepEqual(seen.filter((t) => t === "future/info"), ["future/info"])

  // stop: dispose listener + timer; resume: fold still restores role
  for (const dispose of disposers) dispose()
  timer.clear()
  const restored = reduceRoleFold(dedupeBySeq(sesA.events))
  assert.equal(restored.role, "atlas")
  assert.equal(restored.revision, 1)

  // unmount: every resource returned
  assert.deepEqual(h.stats(), { sessions: 3, flushCount: 1, liveListeners: 0, timers: 0 })
})

test("vertical slice: unknown required event refuses reconstruction", () => {
  const h = createSeamHarness()
  const ses = h.createSession("ses-x")
  assert.throws(() => h.append(ses, { type: "future/required", data: {} }), /unknown required event/)
})

test("vertical slice: job descriptors are never treated as durable children", () => {
  const job = makeDescriptor({ kind: "job", id: "job-1", parentSessionId: "ses-a", role: "explore" })
  assert.throws(() => assertDurableDescriptor(job, "task_send"), /process-local/)
})
