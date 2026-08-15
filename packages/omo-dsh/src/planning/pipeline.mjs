// omo-dsh planning pipeline (E13), pure state machine.
// Two conformance traces with the same approval/metis gates:
//   opencode-compat:      interview → approval → scaffold → metis → Prometheus author
//   dsh-structured-plan:  interview → approval → scaffold → metis → Plan-Compiler → renderer
// Momus + independent Oracle run ONLY when reviewRequired is set (persisted).
// Approval is structural: only approve() transitions; prompt text can never
// forge it. Repair is bounded; rejections are never dropped.
import { sha256 } from "../compat/prompt.mjs"

export const PLANNING_STATES = Object.freeze([
  "idle", "interviewing", "awaiting-approval", "scaffolded", "metis-done",
  "authored", "review", "repairing", "rejected", "approved",
])

export function createPlanningPipeline({ profile = "opencode-compat", reviewRequired = false, maxRepairs = 3, now = () => Date.now() } = {}) {
  if (!["opencode-compat", "dsh-structured-plan"].includes(profile)) {
    throw new TypeError(`profile: expected opencode-compat|dsh-structured-plan, got ${profile}`)
  }
  let state = "idle"
  let repairs = 0
  const log = []
  let planDigest = null
  let interviewNotes = null

  function fail(action, reason) {
    const entry = { action, error: reason, at: now() }
    log.push(entry)
    return { ok: false, state, error: reason }
  }

  function requireState(action, ...allowed) {
    if (!allowed.includes(state)) {
      return fail(action, `state ${state}: expected ${allowed.join("|")}`)
    }
    return null
  }

  return {
    state: () => state,
    log: () => [...log],
    repairs: () => repairs,
    planDigest: () => planDigest,

    startInterview(notes) {
      if (state !== "idle") return fail("startInterview", "not idle")
      interviewNotes = String(notes ?? "")
      state = "interviewing"
      log.push({ action: "startInterview", at: now() })
      return { ok: true, state }
    },

    approve() {
      // Structural approval gate — the ONLY way past awaiting-approval.
      if (state !== "interviewing" && state !== "awaiting-approval") {
        return fail("approve", `state ${state}: expected interviewing|awaiting-approval`)
      }
      state = "awaiting-approval" // normalized post-approval state: approval granted
      log.push({ action: "approve", at: now() })
      // approved-to-plan: scaffold may now run; keep gate as awaiting-approval→scaffolded transition
      state = "scaffolded-eligible"
      return { ok: true, state }
    },

    scaffold(bundle) {
      if (state !== "scaffolded-eligible") return fail("scaffold", "approval required before scaffold")
      state = "scaffolded"
      log.push({ action: "scaffold", at: now(), bundleDigest: bundle ? sha256(JSON.stringify(bundle)) : null })
      return { ok: true, state }
    },

    metis(findings) {
      // mandatory after scaffold, NEVER before approval
      if (state !== "scaffolded") return fail("metis", `state ${state}: mandatory gap analysis requires approval+scaffold first`)
      state = "metis-done"
      log.push({ action: "metis", at: now(), findingsDigest: findings ? sha256(JSON.stringify(findings)) : null })
      return { ok: true, state }
    },

    authorPlan(planText) {
      if (profile !== "opencode-compat") return fail("authorPlan", "compat profile only; use compilePlan for structured profile")
      if (state !== "metis-done") return fail("authorPlan", "metis must complete first")
      state = "authored"
      planDigest = sha256(String(planText))
      log.push({ action: "authorPlan", at: now(), planDigest })
      return { ok: true, state }
    },

    compilePlan(ir) {
      if (profile !== "dsh-structured-plan") return fail("compilePlan", "structured profile only")
      if (state !== "metis-done") return fail("compilePlan", "metis must complete first")
      state = "authored"
      planDigest = sha256(JSON.stringify(ir))
      log.push({ action: "compilePlan", at: now(), planDigest })
      return { ok: true, state }
    },

    review(verdict) {
      if (state !== "authored") return fail("review", "nothing authored to review")
      if (!reviewRequired) return fail("review", "review_required is false: Momus/Oracle are conditional, not universal")
      state = "review"
      log.push({ action: "review", at: now(), verdict })
      if (verdict === "approve") {
        state = "approved"
        log.push({ action: "review-approved", at: now() })
        return { ok: true, state }
      }
      state = "repairing"
      return { ok: true, state, repairing: true }
    },

    repair() {
      if (state !== "repairing") return fail("repair", "not repairing")
      if (repairs >= maxRepairs) {
        state = "rejected"
        log.push({ action: "repair-limit", at: now() })
        return { ok: false, state, error: "repair limit reached; rejections preserved in log" }
      }
      repairs += 1
      state = "authored" // back to reviewable
      log.push({ action: "repair", at: now(), repairs })
      return { ok: true, state }
    },

    approveHandoff() {
      if (state === "approved") {
        const manifest = Object.freeze({
          profile,
          planDigest,
          approvedAt: now(),
          repairCount: repairs,
          reviewRequired,
          interviewNotes,
        })
        log.push({ action: "handoff", at: now(), manifestDigest: sha256(JSON.stringify(manifest)) })
        return { ok: true, state, manifest }
      }
      if (state === "authored" && !reviewRequired) {
        state = "approved"
        const manifest = Object.freeze({
          profile,
          planDigest,
          approvedAt: now(),
          repairCount: repairs,
          reviewRequired: false,
          interviewNotes,
        })
        log.push({ action: "handoff-no-review", at: now(), manifestDigest: sha256(JSON.stringify(manifest)) })
        return { ok: true, state, manifest }
      }
      return fail("approveHandoff", `state ${state}: plan not approvable`)
    },
  }
}
