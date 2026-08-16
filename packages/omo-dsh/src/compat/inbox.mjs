// omo-dsh agent inbox compat, pure part (CT-09).
// DSH facts honored at fixed SHA (packages/core/agent/src/runtime-types.ts):
// - followup: queues an ordinary follow-up turn AND wakes the driver; the
//   item becomes the SOLE ordinary message of its own turn (lines 118-122)
// - steer: steering for the nearest step; an idle driver starts a turn; a
//   running driver consumes it at its next step boundary; a rejected step
//   leaves steering parked until the next wake; cancellation or disposal may
//   discard pending steering (lines 124-131)
// - inject: queues model-facing context for the next pre-step WITHOUT waking
//   the driver; a running driver claims it at the nearest later step
//   boundary; idle drivers leave it pending until follow-up or steering
//   wakes them; it may miss a request whose pre-step already claimed its
//   batch; cancellation or disposal may discard pending context (lines 133-140)
// - send(message, target, wakeup) is the underlying boundary + optional wake.

export function createInbox() {
  let driverState = "idle" // idle | running
  const ordinary = [] // followup turns (each item = its own turn)
  const steering = []
  const injected = []

  const snapshot = () => ({
    driverState,
    ordinary: [...ordinary],
    steering: [...steering],
    injected: [...injected],
  })

  function followup(message) {
    ordinary.push(message)
    driverState = "running" // wakes the driver; the item owns its turn
    return snapshot()
  }

  function steer(message) {
    steering.push(message)
    if (driverState === "idle") driverState = "running" // wake
    return snapshot()
  }

  function inject(message) {
    injected.push(message) // never wakes
    return snapshot()
  }

  /** A running driver reaches a step boundary: claims steering + injected
   *  batch; a rejected step returns steering to the front of the queue. */
  function stepBoundary({ accept = true } = {}) {
    if (driverState !== "running") return { claimed: null, snapshot: snapshot() }
    const steeringBatch = [...steering]
    const injectBatch = [...injected]
    if (accept) {
      steering.length = 0
      injected.length = 0
    } else {
      // rejected step: steering parks until the next wake; injected context
      // is already claimed for this pre-step and may miss the batch (per the
      // DSH "may miss a request" clause it is consumed, not replayed)
      steering.length = 0
      steering.push(...steeringBatch)
      injected.length = 0
    }
    return { claimed: { steering: steeringBatch, injected: injectBatch }, snapshot: snapshot() }
  }

  /** A turn completes; the followup item that owned it is gone. */
  function turnEnded() {
    if (ordinary.length > 0) ordinary.shift()
    driverState = ordinary.length > 0 || steering.length > 0 ? "running" : "idle"
    return snapshot()
  }

  /** Cancellation/disposal: pending steering and injected context are
   *  discarded unless keepInbox; queued ordinary turns are kept. */
  function cancel({ keepInbox = false } = {}) {
    if (!keepInbox) {
      steering.length = 0
      injected.length = 0
    }
    driverState = "idle"
    return snapshot()
  }

  /** A wake submitted while idle always opens its turn boundary — even when
   *  the message is cleared before the driver claims. Modeled as: followup
   *  on an idle driver with an empty message still starts a turn. */
  function wakeWhileIdle(message = null) {
    if (driverState === "idle") {
      if (message !== null) ordinary.push(message)
      driverState = "running"
    }
    return snapshot()
  }

  return { snapshot, followup, steer, inject, stepBoundary, turnEnded, cancel, wakeWhileIdle }
}
