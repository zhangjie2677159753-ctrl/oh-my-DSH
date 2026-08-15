// omo-dsh role controller (OMO-0402), pure part.
// - set() writes an `omo/role` event and folds immediately: memory never runs
//   ahead of the authoritative log.
// - revision CAS: stale writes fail closed.
// - during a protected action, a switch is queued (or refused) — never applied
//   mid-step, so prompt/model/guard always read one frozen revision.
import { PRIMARY_ROLES, ROLE_CHANGED_BY, reduceRoleFold } from "../compat/session.mjs"
import { checkpointPolicy } from "../compat/persistence.mjs"

export function createRoleController({ agents = new Map(), nextSeq = 0, now = () => Date.now() } = {}) {
  function agentState(agentId) {
    if (!agents.has(agentId)) {
      agents.set(agentId, {
        events: [],
        protected: false,
        inFlight: false,
        queue: [],
      })
    }
    return agents.get(agentId)
  }

  return {
    get(agentId) {
      return reduceRoleFold(agentState(agentId).events)
    },

    history(agentId) {
      return agentState(agentId).events
    },

    set(agentId, { role, reason, actor, mode = "queue" }) {
      const st = agentState(agentId)
      if (!PRIMARY_ROLES.includes(role)) throw new TypeError(`role ${JSON.stringify(role)}: expected one of ${PRIMARY_ROLES.join("|")}`)
      if (!ROLE_CHANGED_BY.includes(actor)) throw new TypeError(`actor ${JSON.stringify(actor)}: expected one of ${ROLE_CHANGED_BY.join("|")}`)
      if (typeof reason !== "string" || reason.length === 0) throw new TypeError("reason: required")
      if (mode !== "queue" && mode !== "refuse") throw new TypeError(`mode ${mode}: expected queue|refuse`)

      if (st.protected || st.inFlight) {
        if (mode === "refuse") {
          return { applied: false, queued: false, reason: "refused during protected action" }
        }
        st.queue.push({ role, reason, actor })
        return { applied: false, queued: true, reason: "queued during protected action" }
      }

      const current = this.get(agentId)
      const event = {
        type: "omo/role",
        seq: ++nextSeq,
        time: now(),
        data: {
          schemaVersion: 1,
          role,
          revision: current.revision + 1,
          changedBy: actor,
          reason,
          changedAt: new Date(now()).toISOString(),
        },
      }
      // fold validates monotonic revision — a stale write throws here
      reduceRoleFold([...st.events, event])
      st.events.push(event)
      return { applied: true, queued: false, event, flushRequired: checkpointPolicy(event.type).flushRequired }
    },

    beginProtectedAction(agentId) {
      const st = agentState(agentId)
      if (st.inFlight) throw new Error("beginProtectedAction: already in flight")
      st.inFlight = true
      st.protected = true
    },

    endProtectedAction(agentId) {
      const st = agentState(agentId)
      if (!st.inFlight) throw new Error("endProtectedAction: no action in flight")
      st.inFlight = false
      st.protected = false
      const queued = st.queue.splice(0)
      const results = []
      for (const request of queued) {
        try {
          results.push(this.set(agentId, { ...request, actor: request.actor, mode: "queue" }))
        } catch (error) {
          results.push({ applied: false, queued: false, error: error.message })
        }
      }
      return { drained: queued.length, results }
    },

    pending(agentId) {
      return [...agentState(agentId).queue]
    },
  }
}
