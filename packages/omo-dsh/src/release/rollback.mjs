// omo-dsh rollback state machine (E31), pure part.
// Trigger classification and the fixed rollback step order:
//   kill switches → settle/cancel children → read-only export → restore
//   backup → verify zero residuals → reconstruct incident timeline.
// Every step is an injectable op so the drill can run with fake resources.
export const ROLLBACK_TRIGGERS = Object.freeze({
  "atlas-guard-bypass": "role tool guard bypass observed",
  "data-leak": "cross-session or memory data leak",
  "false-success": "work completed without machine evidence",
  "retry-storm": "unbounded retry/fallback loop",
  "orphan-storm": "orphaned children accumulating",
  "migration-loss": "state migration lost data",
  "secret-leak": "credential leaked into logs/session",
  "side-effect-replay": "non-idempotent side effect replayed by fallback",
  "unmount-leak": "stop/unmount left residual resources",
})

export function assessRollbackTrigger(events) {
  for (const event of events) {
    if (event?.kind && ROLLBACK_TRIGGERS[event.kind]) {
      return { trigger: true, kind: event.kind, reason: ROLLBACK_TRIGGERS[event.kind] }
    }
  }
  return { trigger: false }
}

export const ROLLBACK_STEPS = Object.freeze([
  "kill-switches",
  "settle-children",
  "export-sessions",
  "restore-backup",
  "verify-residuals",
  "timeline",
])

export function createRollbackRunner({ ops }) {
  const required = ROLLBACK_STEPS.filter((step) => typeof ops?.[step] !== "function")
  if (required.length > 0) throw new TypeError(`rollback ops missing: ${required.join(", ")}`)
  const evidence = []
  return {
    async run({ trigger }) {
      for (const step of ROLLBACK_STEPS) {
        try {
          const result = await ops[step]()
          evidence.push({ step, ok: true, ...result })
          if (step === "verify-residuals" && result.residuals !== 0) {
            return { ok: false, phase: step, reason: `residual resources remain: ${result.residuals}`, evidence }
          }
        } catch (error) {
          evidence.push({ step, ok: false, error: error.message })
          return { ok: false, phase: step, reason: error.message, evidence }
        }
      }
      return { ok: true, trigger, evidence }
    },
  }
}

/** Incident timeline reconstruction from ordered evidence records. */
export function reconstructTimeline(records) {
  return records
    .slice()
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .map((record) => ({ at: record.at ?? null, kind: record.kind ?? "unknown", detail: record.detail ?? null }))
}
