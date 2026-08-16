// omo-dsh reminder-class hook decision layers (E22), pure part.
// Facts and constants verified against fixed-SHA sources
// (docs/upstream/reminder-hooks-fixture.json). Runtime injection (context
// mutation, toast, OS notification) remains a DSH binding.
export const SESSION_NOTIFY = Object.freeze({
  idleConfirmationDelayMs: 1500,
  maxTrackedSessions: 100,
  playSoundDefault: false,
})

export function evaluateSessionNotify({ eventType, isMainSession = true, config = {} }) {
  const relevant = ["session.idle", "permission", "question"].some((prefix) => String(eventType).startsWith(prefix))
  if (!relevant) return { notify: false, reason: "event not notification-relevant" }
  if (!isMainSession) return { notify: false, reason: "only the main session notifies" }
  return {
    notify: true,
    delayMs: config.idleConfirmationDelayMs ?? SESSION_NOTIFY.idleConfirmationDelayMs,
    sound: config.playSound ?? SESSION_NOTIFY.playSoundDefault,
    maxTracked: SESSION_NOTIFY.maxTrackedSessions,
  }
}

export function buildReadmeInjection(readmePath) {
  return `[Project README: ${readmePath}]`
}

export function createReadmeInjector() {
  const injected = new Set()
  return {
    once(dir) {
      if (injected.has(dir)) return null
      injected.add(dir)
      return dir
    },
    injected: () => [...injected],
  }
}

export function evaluateThinkMode({ text, keywords = [], currentVariant = null }) {
  if (currentVariant === "high") return { switchTo: null, reason: "already high variant" }
  const haystack = String(text ?? "").toLowerCase()
  const hit = keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()))
  return hit ? { switchTo: "high", reason: "think keyword matched" } : { switchTo: null }
}

export const KEYWORD_MODES = Object.freeze({
  "ultrawork": { mainOnly: false },
  "team": { mainOnly: true },
  "hyperplan": { mainOnly: true },
  "hyperplan-ultrawork": { mainOnly: true },
})

export function detectKeywordMode({ text, isMainSession = true, keywords = {}, hasHppFile = false }) {
  const haystack = String(text ?? "").toLowerCase()
  const matched = []
  for (const mode of Object.keys(KEYWORD_MODES)) {
    const list = keywords[mode] ?? []
    if (list.some((keyword) => haystack.includes(String(keyword).toLowerCase()))) matched.push(mode)
  }
  const allowed = matched.filter((mode) => isMainSession || !KEYWORD_MODES[mode].mainOnly)
  if (allowed.includes("hyperplan") && hasHppFile) {
    return { triggered: false, reason: "hyperplan suppressed by .hpp file guard" }
  }
  return allowed.length > 0 ? { triggered: true, modes: allowed } : { triggered: false }
}

export const SEARCH_TOOLS = Object.freeze([
  "grep", "glob", "webfetch", "read", "grep_app_*",
  "LspHover", "LspCodeActions", "LspCodeActionResolve", "search", "web_search",
])

export function createAgentUsageReminder({ isOrchestrator = false, maxReminders = 3 } = {}) {
  let reminders = 0
  let delegated = false
  return {
    state: () => ({ reminders, delegated }),
    onTool({ toolName }) {
      if (!isOrchestrator) return { remind: false }
      if (delegated) return { remind: false, reason: "delegation already used" }
      if (["task", "task_*", "call_omo_agent", "teammate"].includes(toolName)) {
        delegated = true
        return { remind: false, delegatedNow: true }
      }
      if (SEARCH_TOOLS.includes(toolName)) {
        if (reminders >= maxReminders) return { remind: false, reason: "max reminders reached" }
        reminders += 1
        return { remind: true, text: "Prefer delegating search to task(explore) or task(librarian)." }
      }
      return { remind: false }
    },
  }
}

export function createCategorySkillReminder({ role = "sisyphus", threshold = 3, delegableTools = SEARCH_TOOLS } = {}) {
  if (!["sisyphus", "atlas"].includes(role)) return null
  let count = 0
  let delegated = false
  return {
    state: () => ({ count, delegated }),
    onTool({ toolName }) {
      if (delegated) return { inject: false }
      if (["task", "task_*", "call_omo_agent", "teammate"].includes(toolName)) {
        delegated = true
        return { inject: false }
      }
      if (delegableTools.includes(toolName)) count += 1
      if (count >= threshold && !delegated) {
        count = 0
        return { inject: true, text: "Consider the category skills for this work; prefer custom skills when available." }
      }
      return { inject: false }
    },
  }
}

export function evaluateHephaestusAgentsInjection({ role, userMessageCount = 0, alreadyInjected = false }) {
  if (role !== "hephaestus") return { inject: false, reason: "hephaestus only" }
  if (userMessageCount > 0) return { inject: false, reason: "only before the first user message" }
  if (alreadyInjected) return { inject: false, reason: "once per session" }
  return { inject: true }
}

export function evaluateBashFileRead(command) {
  const trimmed = String(command ?? "").trim()
  const simple = /^(cat|head|tail)(\s+-[a-zA-Z0-9]+)*\s+[\w./-]+$/.test(trimmed)
  return simple
    ? { warn: true, message: "Prefer the Read tool for file reads." }
    : { warn: false }
}

export const TODO_DESCRIPTION_OVERRIDE = Object.freeze({
  appliesTo: "todowrite",
  template: [
    "Record tasks with four elements: WHERE (file/path), WHY (reason), HOW (approach), RESULT (expected).",
    "priority is a string, not a number.",
    "One todo_write call covers 1-3 atomic tasks; no partial lists.",
  ].join(" "),
})

export function overrideTodoDescription() {
  return TODO_DESCRIPTION_OVERRIDE.template
}
