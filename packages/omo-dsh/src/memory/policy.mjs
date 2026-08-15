// omo-dsh memory policy skeleton (E23), pure part.
// - scopes: repo | user | session; session-scope is the only default-off-for-
//   long-term scope (per-turn working memory only)
// - consent gate: no consent, no write; session scope needs no long-term consent
// - secret sniff: anything secret-shaped is denied at the boundary
// - deletion is a tombstone (content removed, audit marker retained)
// - cross-session isolation: repo memory is readable only within its repo scope
const SECRET_SNIFF = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{8,})/i

export function assertMemoryWriteAllowed({ scope, consent, content, sessionScopes = new Set() }) {
  if (!["repo", "user", "session"].includes(scope)) {
    return { allowed: false, reason: `unknown memory scope ${scope}` }
  }
  if (scope === "repo" && consent !== true) {
    return { allowed: false, reason: "repo-scope memory requires explicit consent" }
  }
  if (scope === "user" && consent !== true) {
    return { allowed: false, reason: "user-scope memory requires explicit consent" }
  }
  if (scope === "session" && !sessionScopes.has(scope)) {
    return { allowed: false, reason: "session memory is working memory only; it never persists across sessions" }
  }
  if (typeof content === "string" && SECRET_SNIFF.test(content)) {
    return { allowed: false, reason: "content looks like a secret; redact or refuse" }
  }
  return { allowed: true }
}

export function applyRedaction(content) {
  if (typeof content !== "string") return content
  return content.replace(SECRET_SNIFF, "[REDACTED]")
}

export function readScope(entry, { scope, repoId, sessionId }) {
  if (entry.tombstoned) return null
  if (entry.scope === "repo") return entry.repoId === repoId ? entry : null
  if (entry.scope === "user") return entry
  if (entry.scope === "session") return entry.sessionId === sessionId ? entry : null
  return null
}

export function tombstone(entry, { at = Date.now() } = {}) {
  return Object.freeze({
    scope: entry.scope,
    repoId: entry.repoId ?? null,
    sessionId: entry.sessionId ?? null,
    tombstoned: true,
    tombstonedAt: at,
  })
}
