// omo-dsh monitor policy (E26), pure part.
// - start/stop/list lifecycle
// - duplicate intervention: only one monitor may own an intervention per
//   target (lease); a second claimant is rejected
// - observers are READ-ONLY by construction: the registry exposes no method
//   that can flip completion authority
// - session cleanup removes every monitor bound to the session
export function createMonitorRegistry() {
  const monitors = new Map()
  const interventions = new Map()
  return {
    start({ id, sessionId, kind = "watchdog" }) {
      if (monitors.has(id)) throw new Error(`monitor ${id} already running`)
      const monitor = Object.freeze({ id, sessionId, kind, startedAt: Date.now() })
      monitors.set(id, monitor)
      return monitor
    },
    stop(id) {
      if (!monitors.has(id)) throw new Error(`monitor ${id} not running`)
      monitors.delete(id)
      return { stopped: id }
    },
    list() {
      return [...monitors.values()]
    },
    claimIntervention({ target, monitorId }) {
      if (!monitors.has(monitorId)) throw new Error(`claiming monitor ${monitorId} is not running`)
      if (interventions.has(target) && interventions.get(target) !== monitorId) {
        return { granted: false, owner: interventions.get(target), reason: "duplicate intervention lease" }
      }
      interventions.set(target, monitorId)
      return { granted: true, owner: monitorId }
    },
    releaseIntervention({ target, monitorId }) {
      if (interventions.get(target) !== monitorId) {
        throw new Error(`intervention on ${target} owned by ${interventions.get(target)}`)
      }
      interventions.delete(target)
      return { released: true }
    },
    cleanupSession(sessionId) {
      const removed = []
      for (const [id, monitor] of monitors) {
        if (monitor.sessionId === sessionId) { monitors.delete(id); removed.push(id) }
      }
      for (const [target, monitorId] of interventions) {
        if (!monitors.has(monitorId)) interventions.delete(target)
      }
      return { removed }
    },
    // Deliberately NO completion/set methods: observers cannot touch authority.
  }
}
