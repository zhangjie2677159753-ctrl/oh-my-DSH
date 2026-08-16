// omo-dsh background notification compat, pure part.
// Native-equivalence #2 compat patch (docs/plans/NATIVE-EQUIVALENCE-PROOFS.md §2).
// Verified at the fixed SHA (hooks/background-notification/hook.ts):
// - forwarded event set: message.updated, message.part.updated,
//   message.part.delta, todo.updated, session.idle, session.error,
//   session.deleted, session.status + prefix session.next.*
// - chat.message injects ALL pending notifications into the next chat message
// DSH native: only settlement-level events exist (subagent/start,
// subagent/end). omo-dsh subscribes subagent/end, appends owned
// `omo/notification` session events, and injects pending notifications into
// the next turn via prompt section, then clears the pending set (idempotent,
// replay-safe: injection renders ONLY events still pending).

export const NOTIFICATION_EVENT_TYPE = "omo/notification"

export const NOTIFICATION_STATUSES = Object.freeze(["completed", "failed", "interrupted"])

const MAX_PENDING = 8

export function normalizeStatus(raw) {
  const s = String(raw ?? "").toLowerCase()
  return NOTIFICATION_STATUSES.includes(s) ? s : "completed"
}

/**
 * Build the owned, lossless-JSON-safe notification event data for
 * Session.append(type: "omo/notification", data).
 */
export function buildNotificationEvent({ childRole, childSessionId, status, summary = "", at = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    source: "subagent-end",
    childRole: String(childRole ?? ""),
    childSessionId: childSessionId ?? null,
    status: normalizeStatus(status),
    summary: String(summary ?? "").slice(0, 512),
    at,
  }
}

/** Map a settled DSH subagent/end event to an owned notification event. */
export function settlementToNotification({ childRole, childSessionId, ok, error = null }) {
  return buildNotificationEvent({
    childRole,
    childSessionId,
    status: ok ? "completed" : "failed",
    summary: ok ? "" : String(error ?? "subagent failed").slice(0, 512),
  })
}

/**
 * Merge one notification into the pending list: same childSessionId replaces
 * its previous entry (latest wins); capped at MAX_PENDING (oldest dropped).
 * Returns a new array (never mutates input).
 */
export function mergePendingNotifications(pending = [], event) {
  const key = event?.childSessionId ?? null
  const kept = pending.filter((e) => e?.childSessionId !== key)
  kept.push(event)
  return kept.slice(-MAX_PENDING)
}

/**
 * Render the next-turn injection block for pending notifications; returns ""
 * when the list is empty. Upstream shape: notifications ride the next chat
 * message; omo-dsh injects them as a prompt section.
 */
export function renderNotificationInjection(events = []) {
  const lines = events.map((e) => {
    const head = e.status === "completed" ? "done" : e.status
    const who = e.childRole ? `${e.childRole} (${e.childSessionId})` : String(e.childSessionId ?? "subagent")
    return `[Background Notification] ${who}: ${head}${e.summary ? ` — ${e.summary}` : ""}`
  })
  return lines.length === 0 ? "" : lines.join("\n")
}

/**
 * Full next-turn injection decision: render + consume. Returns
 * { text, pending: [] } — callers append the text and persist the emptied
 * pending set; events never render twice.
 */
export function consumePendingNotifications(pending = []) {
  return { text: renderNotificationInjection(pending), pending: [] }
}
