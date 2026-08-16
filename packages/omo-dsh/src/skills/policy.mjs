// omo-dsh skills policy (OMO-1903/1904), pure part.
// Verified skills-loader-core semantics at the fixed SHA:
// - scope priority (higher wins on name conflicts):
//   opencode-project(6) > project(5) > opencode(4) > user(3) > config(2) > shared/builtin(1)
// - skills.disable (array | false entries | {disable:true}) removes by
//   lowercased name; skills.enable non-empty acts as an allowlist
// - same-name conflict: higher scope wins; dedupe keeps the first winner
// - explicit load only (getSkillByName / slash-command / task load_skills);
//   there is NO per-turn automatic injection
// - invocation tracking is authoritative: only a parsed command/API load
//   counts — observing a SKILL.md read never marks a skill invoked (Senpi
//   lesson)
export const SKILL_SCOPES = Object.freeze([
  "shared/builtin", "config", "user", "opencode", "project", "opencode-project",
])

export const SCOPE_PRIORITY = Object.freeze({
  "shared/builtin": 1,
  "config": 2,
  "user": 3,
  "opencode": 4,
  "project": 5,
  "opencode-project": 6,
})

function scopeOrder(a, b) {
  return SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope]
}

function normalizeDisableList(disable) {
  if (!Array.isArray(disable)) return new Set()
  const names = new Set()
  for (const entry of disable) {
    if (entry === false) continue // false entries are inert
    if (typeof entry === "string") names.add(entry.toLowerCase())
    else if (entry && typeof entry === "object" && entry.disable === true && typeof entry.name === "string") {
      names.add(entry.name.toLowerCase())
    }
  }
  return names
}

/**
 * Merge discovered skills into the effective, loaded-on-demand catalog.
 */
export function mergeSkills({ discovered = [], disable = [], enable = [] } = {}) {
  const disabled = normalizeDisableList(disable)
  const allowlist = Array.isArray(enable) && enable.length > 0
    ? new Set(enable.map((e) => (typeof e === "string" ? e.toLowerCase() : null)).filter(Boolean))
    : null

  const sorted = [...discovered].sort(scopeOrder) // ascending priority
  const byName = new Map()
  const conflicts = []
  for (const skill of sorted) {
    const name = String(skill?.name ?? "").toLowerCase()
    if (name.length === 0) continue
    if (disabled.has(name)) continue
    if (allowlist !== null && !allowlist.has(name)) continue
    if (byName.has(name)) {
      // ascending order: later (higher scope) overwrites and wins
      conflicts.push({ name, kept: skill.scope, dropped: byName.get(name).scope })
    }
    byName.set(name, { ...skill, name })
  }
  return {
    skills: [...byName.values()],
    conflicts,
    counts: { discovered: discovered.length, effective: byName.size },
  }
}

/**
 * Authoritative invocation tracking: mark invoked ONLY from an explicit
 * load (command parse or API), never from observing a SKILL.md read or any
 * natural-language mention.
 */
export function createInvocationTracker() {
  const invoked = new Map()
  return {
    recordExplicitLoad(name, source) {
      if (typeof name !== "string" || name.length === 0) throw new TypeError("skill name required")
      invoked.set(name.toLowerCase(), { name: name.toLowerCase(), source, at: Date.now() })
      return invoked.get(name.toLowerCase())
    },
    wasInvoked(name) {
      return invoked.has(String(name).toLowerCase())
    },
    // SKILL.md reads and fuzzy mentions are observations, not invocations.
    observeSkillFileRead() {
      return { invoked: false, reason: "SKILL.md read is not an invocation (Senpi lesson)" }
    },
    list() {
      return [...invoked.values()]
    },
  }
}
