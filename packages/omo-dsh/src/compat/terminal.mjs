// omo-dsh terminal reminder compat, pure part.
// Native-equivalence #4 compat patch (docs/plans/NATIVE-EQUIVALENCE-PROOFS.md §4).
// Verified at the fixed SHA (hooks/interactive-bash-session/constants.ts):
// - OMO_SESSION_PREFIX = "omo-"
// - buildSessionReminderMessage(sessions) returns "" when empty, else
//   "\n\n[System Reminder] Active omo-* tmux sessions: a, b"
// DSH side: terminals.list(owner) snapshots are projected into the SAME
// reminder text (session names in place of tmux session names), injected
// into the next turn prompt or terminal tool output.

export const OMO_SESSION_PREFIX = "omo-"

/** Exact upstream reminder message format. */
export function buildSessionReminderMessage(sessions = []) {
  const names = sessions.filter((s) => s !== null && s !== undefined && s !== "").map(String)
  if (names.length === 0) return ""
  return `\n\n[System Reminder] Active omo-* tmux sessions: ${names.join(", ")}`
}

/**
 * Project DSH terminal snapshots ({name}[]) into a reminder decision.
 * Returns { message } with the upstream-formatted text, or null when there
 * are no omo-prefixed active sessions.
 */
export function terminalSessionReminder(snapshots = []) {
  const names = snapshots
    .map((s) => s?.name)
    .filter((n) => typeof n === "string" && n.startsWith(OMO_SESSION_PREFIX))
  const message = buildSessionReminderMessage(names)
  return message.length > 0 ? { message, sessions: names } : null
}
