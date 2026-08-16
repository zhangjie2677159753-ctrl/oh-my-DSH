// omo-dsh comment checker policy (OMO-2007), pure part.
// Verified comment-checker-core semantics at the fixed SHA:
// - REPORT ONLY: the checker never edits code or comments
// - exit-code contract: 0 = clean, 2 = findings (stderr becomes the warning)
// - per-session 30s dedupe: repeated findings are suppressed in the window
// - missing binary is silent (never blocks the tool)
// - feedback length is capped before it reaches the model
export const COMMENT_CHECKER_CONTRACT = Object.freeze({
  exitClean: 0,
  exitFindings: 2,
  dedupeWindowMs: 30_000,
  maxFeedbackBytes: 4096,
})

export function evaluateCommentCheck({ exitCode, stderr = "", now = () => Date.now(), state = { lastAt: null, lastDigest: null } }) {
  if (exitCode === 0) {
    return { report: false, message: null, state: { ...state, lastAt: now() } }
  }
  if (exitCode !== 2) {
    // unknown exit codes are surfaced but never interpreted as findings
    return { report: false, message: null, reason: `unexpected exit ${exitCode}`, state }
  }
  const message = String(stderr ?? "").slice(0, COMMENT_CHECKER_CONTRACT.maxFeedbackBytes)
  const digest = message.length > 0 ? message : "(empty)"
  const withinWindow = state.lastAt !== null && now() - state.lastAt < COMMENT_CHECKER_CONTRACT.dedupeWindowMs
  if (withinWindow && state.lastDigest === digest) {
    return { report: false, deduped: true, state }
  }
  return { report: true, message, deduped: false, state: { lastAt: now(), lastDigest: digest } }
}

export function commentCheckMissingBinary() {
  // verified: a missing checker binary is SILENT — the tool call proceeds
  return { report: false, message: null, silent: true }
}
