// omo-dsh task concurrency/budget (OMO-1101), pure part.
// - parent active-children cap with FIFO queue; release wakes the next waiter
// - single-writer workspace lease (writer exclusivity)
// - cancel/settlement race: a cancel that lands BEFORE settlement marks the
//   outcome cancelled; one that lands AFTER settlement changes nothing.

export function createChildBudget({ maxActiveChildren = 4, maxQueueSize = 64 } = {}) {
  if (!Number.isInteger(maxActiveChildren) || maxActiveChildren < 1) throw new TypeError("maxActiveChildren: positive integer")
  if (!Number.isInteger(maxQueueSize) || maxQueueSize < 0) throw new TypeError("maxQueueSize: non-negative integer")
  let active = 0
  const queue = []
  return {
    state: () => ({ active, queued: queue.length }),
    acquire(id) {
      if (active < maxActiveChildren) {
        active += 1
        return { granted: true, id, active }
      }
      if (queue.length >= maxQueueSize) return { granted: false, reason: "queue-full", id }
      queue.push(id)
      return { granted: false, queued: true, id }
    },
    release(id) {
      const queuedIndex = queue.indexOf(id)
      if (queuedIndex >= 0) { queue.splice(queuedIndex, 1); return { released: false, id } }
      if (active === 0) throw new Error(`release(${id}): nothing active`)
      active -= 1
      const next = queue.shift()
      if (next !== undefined) {
        active += 1
        return { released: true, id, nextGranted: next, active }
      }
      return { released: true, id, nextGranted: null, active }
    },
  }
}

export function createWriterLease() {
  let holder = null
  let seq = 0
  return {
    state: () => ({ holder, seq }),
    acquire(writerId) {
      if (holder !== null) return { granted: false, holder, writerId }
      holder = writerId
      return { granted: true, holder, leaseId: ++seq }
    },
    release(writerId, leaseId) {
      if (holder !== writerId) throw new Error(`release: lease held by ${holder}, not ${writerId}`)
      if (leaseId !== seq) throw new Error(`release: stale leaseId ${leaseId} (current ${seq})`)
      holder = null
      return { released: true, writerId }
    },
  }
}

/**
 * Cancel/settlement race: cooperative cancellation cannot stop in-process
 * work; a cancel that arrives before settlement makes the outcome cancelled,
 * and a cancel that arrives after settlement is a no-op.
 */
export function createSettlement({ running = true } = {}) {
  let settled = null
  let cancelPending = false
  return {
    state: () => ({ settled, cancelPending }),
    cancel(reason = "cancelled") {
      if (settled !== null) return { applied: false, reason: "already settled" }
      cancelPending = true
      return { applied: true, reason }
    },
    settle(result) {
      if (settled !== null) throw new Error("settle: already settled")
      settled = cancelPending ? { status: "cancelled", result: null, sideEffectsPossible: true } : { status: "ok", result }
      return settled
    },
  }
}
