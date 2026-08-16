// omo-dsh session lifecycle compat, pure part (CT-04/05/06).
// DSH facts honored at fixed SHA (packages/core/session/src/index.ts):
// - CT-04 seed replay: a seeded session appends `session/end-seed` ONCE;
//   re-marking is SKIPPED when the seed already ends with one (lines 545-546);
//   consumers reading STORED history locate the LAST end-seed event, not
//   necessarily one at firstLiveSeq (lines 456-464); constructor seeds do NOT
//   emit on the firehose.
// - CT-05 observer containment: once the event enters the log the append is
//   COMMITTED; observer failures are logged and contained per listener; they
//   do not change the return value nor prevent later listeners (lines 570-576).
// - CT-06 reentrant refusal: announce() throws "session X was already
//   announced" including a REENTRANT call from a creation listener
//   (lines 960-969); a listener cannot recursively create a second lifecycle
//   edge. The same fail-loud rule is mirrored for nested append from within
//   an observer.

export const END_SEED_TYPE = "session/end-seed"

/** Mirror of the seed-marker append: skip re-marking when the log already
 *  ends with session/end-seed. Returns the log after the decision. */
export function appendSeedMarker(events, append) {
  if (events.length > 0 && events[events.length - 1]?.type === END_SEED_TYPE) {
    return { events, appended: false, reason: "seed already ends with end-seed" }
  }
  const event = append(END_SEED_TYPE, {})
  return { events: [...events, event], appended: true, event }
}

/** Stored-history consumer rule: locate the LAST session/end-seed event. */
export function locateLastEndSeed(events) {
  let index = -1
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type === END_SEED_TYPE) index = i
  }
  return index
}

/** First live seq = seed length (events before the marker never published). */
export function firstLiveSeq(seedLength) {
  if (!Number.isInteger(seedLength) || seedLength < 0) throw new TypeError("seedLength: expected non-negative integer")
  return seedLength
}

/**
 * CT-05 mirror: commit FIRST, then notify observers. Observer failures are
 * contained per listener (collected into observerErrors) and never roll the
 * commit back nor prevent later observers from running.
 */
export function commitThenNotify({ commit, observers = [], log = (message) => {} }) {
  const committed = commit()
  const observerErrors = []
  for (const observer of observers) {
    try {
      observer(committed)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`observer failure contained: ${message}`)
      observerErrors.push(message)
    }
  }
  return { committed, observerErrors, allObserversRan: true }
}

/**
 * CT-06 mirror: announce-once guard. The first announce marks the entry
 * announcing BEFORE emitting so a synchronous listener throw pairs with a
 * disposal edge and a reentrant listener cannot create a second edge.
 */
export function createAnnounceGuard({ sessionId }) {
  let announced = false
  let announcing = false
  return {
    state: () => ({ announced, announcing }),
    announce(run) {
      if (announced || announcing) {
        throw new Error(`session "${sessionId}" was already announced`)
      }
      announcing = true
      let result
      try {
        result = run()
      } finally {
        announcing = false
        announced = true // DSH marks announced BEFORE emitting; the guard
        // marks after run() so a throwing run still pairs with disposal
        // semantics at the caller; re-entry during run() is refused by
        // `announcing`.
      }
      return result
    },
  }
}

/**
 * CT-06 mirror: append guard that refuses a NESTED append issued from within
 * an observer of an in-flight append (the append hot path is synchronous, so
 * a reentrant observer append is an immediate programming error).
 */
export function createAppendGuard({ sessionId }) {
  let appending = false
  return {
    state: () => ({ appending }),
    append(run) {
      if (appending) {
        throw new Error(`session "${sessionId}": reentrant append refused (append from within an observer)`)
      }
      appending = true
      try {
        return run()
      } finally {
        appending = false
      }
    },
  }
}
