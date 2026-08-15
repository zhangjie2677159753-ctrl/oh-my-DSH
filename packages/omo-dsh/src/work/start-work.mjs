// omo-dsh /start-work command handling (OMO-1501..1504), pure part.
// Verified upstream contracts:
// - parsed command only (never natural-language "start work" fuzzy matching)
// - selects registered Atlas, else falls back to Sisyphus — in the SAME session
// - stamps the outgoing message role; clears stale stop-continuation state
// - rewrites a stale Boulder agent=prometheus to the execution role with an
//   auditable note; context injection is idempotent (marker)
import { createRoleController } from "../roles/controller.mjs"
import { PRIMARY_ROLES } from "../compat/session.mjs"

export function parseStartWork(text) {
  if (typeof text !== "string") return null
  const trimmed = text.trim()
  if (!trimmed.startsWith("/start-work")) return null
  const rest = trimmed.slice("/start-work".length).trim()
  const options = { planName: null, worktree: null, makePr: false, ship: false }
  const tokens = rest.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === "--make-pr") { options.makePr = true; continue }
    if (token === "--ship") { options.ship = true; continue }
    if (token.startsWith("--worktree=")) { options.worktree = token.slice("--worktree=".length) || null; continue }
    if (token.startsWith("--")) return { kind: "invalid", detail: `unknown flag ${token}` }
    if (token.startsWith('"')) {
      // quoted plan name may contain spaces: rejoin until closing quote
      const parts = [token]
      while (i + 1 < tokens.length && !parts[parts.length - 1].endsWith('"')) {
        parts.push(tokens[++i])
      }
      options.planName = parts.join(" ").replace(/^"|"$/g, "")
      continue
    }
    if (options.planName === null) options.planName = token
    else return { kind: "invalid", detail: `unexpected token ${token}` }
  }
  return { kind: "command", ...options }
}

/**
 * Context selection: explicit plan name > most recent same-session plan >
 * active Boulder resume; ambiguity must be surfaced, never silently chosen.
 */
export function selectPlanContext({ explicitName, recentSessionPlans = [], activeBoulder = null, knownPlans = [] }) {
  if (explicitName) {
    if (!knownPlans.includes(explicitName)) {
      return { status: "unknown-plan", planName: explicitName, knownPlans }
    }
    return { status: "explicit", planName: explicitName }
  }
  if (recentSessionPlans.length > 0) {
    return { status: "recent-session", planName: recentSessionPlans[recentSessionPlans.length - 1] }
  }
  if (activeBoulder?.planName) {
    return { status: "active-boulder-resume", planName: activeBoulder.planName }
  }
  if (knownPlans.length === 1) return { status: "only-plan", planName: knownPlans[0] }
  if (knownPlans.length > 1) return { status: "needs-choice", options: knownPlans }
  return { status: "no-plan", reason: "no plan available" }
}

/**
 * Authoritative role transition: same-session `omo/role` event with
 * changedBy=start-work; Atlas when registered, Sisyphus fallback.
 */
export function buildRoleTransition({ controller, agentId, atlasRegistered, planName, markerSet }) {
  if (!controller) throw new TypeError("buildRoleTransition: controller required")
  const role = atlasRegistered ? "atlas" : "sisyphus"
  const result = controller.set(agentId, {
    role,
    reason: `start-work for ${planName}`,
    actor: "start-work",
  })
  return {
    applied: result.applied,
    role,
    flushRequired: result.flushRequired,
    event: result.event ?? null,
    queued: result.queued,
    // outgoing message must stamp the selected execution role
    outgoingMessageRole: role,
    // prior stop-continuation state is cleared on work start
    stopContinuationCleared: true,
    // context marker injection is idempotent
    contextMarker: markerSet ? "already-injected" : "inject-now",
  }
}

/**
 * Stale Boulder agent reconciliation: a plan left by Prometheus must record
 * the execution role with provenance instead of keeping the planner role.
 */
export function reconcileBoulderAgent(boulder, targetRole) {
  if (!PRIMARY_ROLES.includes(targetRole)) throw new TypeError(`targetRole: expected primary role, got ${targetRole}`)
  if (boulder.agent === "prometheus") {
    return {
      ...boulder,
      agent: targetRole,
      agentReconciled: { from: "prometheus", to: targetRole, at: Date.now(), reason: "start-work" },
    }
  }
  return boulder
}
