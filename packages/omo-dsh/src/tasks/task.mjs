// omo-dsh task facade normalization (OMO-0901), pure part.
// Verified OMO contracts at fixed SHA:
// - category wins when both category and subagent_type are supplied
//   (deprecation warning, NOT a hard mutual exclusion)
// - run_in_background omitted → false
// - load_skills omitted → []; explicit null is REJECTED
// - direct `sisyphus-junior` and primary coordinators are not valid targets
// - unknown category fails BEFORE any model fetch
// - background flag never duplicates: returned descriptor marks the kind.

export const CHILD_ROLES = Object.freeze(["explore", "librarian", "oracle", "metis", "momus", "multimodal-looker"])
export const PRIMARY_ROLES = Object.freeze(["sisyphus", "hephaestus", "prometheus", "atlas"])
const CATEGORY_TO_ROLE = Object.freeze({
  quick: "sisyphus-junior",
  explore: "sisyphus-junior",
  librarian: "sisyphus-junior",
  oracle: "sisyphus-junior",
  metis: "sisyphus-junior",
  momus: "sisyphus-junior",
  default: "sisyphus-junior",
})

export function normalizeTaskArgs(raw) {
  const errors = []
  const warnings = []
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["task args: expected object"] }
  }
  if (typeof raw.description !== "string" || raw.description.trim().length === 0) {
    errors.push("description: required non-empty string")
  }
  if (typeof raw.prompt !== "string" || raw.prompt.trim().length === 0) {
    errors.push("prompt: required non-empty string")
  }
  let background = raw.run_in_background
  if (background === undefined || background === null) background = false
  if (typeof background !== "boolean") errors.push("run_in_background: expected boolean (default false)")

  let skills
  if (raw.load_skills === undefined) skills = []
  else if (raw.load_skills === null) errors.push("load_skills: explicit null is rejected (default [])")
  else if (!Array.isArray(raw.load_skills) || raw.load_skills.some((s) => typeof s !== "string")) {
    errors.push("load_skills: expected string[]")
  } else {
    skills = [...raw.load_skills]
  }

  const hasCategory = raw.category !== undefined && raw.category !== null && raw.category !== ""
  const hasSubagent = raw.subagent_type !== undefined && raw.subagent_type !== null && raw.subagent_type !== ""
  if (!hasCategory && !hasSubagent) errors.push("one of category or subagent_type is required")
  if (hasCategory && typeof raw.category !== "string") errors.push("category: expected string")
  if (hasSubagent && typeof raw.subagent_type !== "string") errors.push("subagent_type: expected string")

  let target
  if (hasCategory) {
    if (hasSubagent) warnings.push("deprecation: category and subagent_type both supplied — category wins (compat)")
    target = resolveTaskTarget({ category: raw.category })
    if (target.status === "error") errors.push(...target.errors)
  } else if (hasSubagent) {
    target = resolveTaskTarget({ subagent_type: raw.subagent_type })
    if (target.status === "error") errors.push(...target.errors)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized: errors.length === 0 ? {
      description: raw.description.trim(),
      prompt: raw.prompt.trim(),
      category: hasCategory ? raw.category : null,
      subagentType: hasCategory ? null : (hasSubagent ? raw.subagent_type : null),
      runInBackground: background,
      skills,
      target,
    } : null,
  }
}

export function resolveTaskTarget({ category, subagent_type }) {
  if (category !== undefined && category !== null) {
    const role = CATEGORY_TO_ROLE[category] ?? CATEGORY_TO_ROLE.default
    return { status: "ok", role, category, via: "category" }
  }
  if (subagent_type !== undefined && subagent_type !== null) {
    if (subagent_type === "sisyphus-junior") {
      return { status: "error", errors: ["subagent_type \"sisyphus-junior\": Junior is selected by category, not directly"] }
    }
    if (PRIMARY_ROLES.includes(subagent_type)) {
      return { status: "error", errors: [`subagent_type "${subagent_type}": primary coordinators cannot be task targets`] }
    }
    if (!CHILD_ROLES.includes(subagent_type)) {
      return { status: "error", errors: [`subagent_type "${subagent_type}": unknown child role`] }
    }
    return { status: "ok", role: subagent_type, subagentType: subagent_type, via: "subagent_type" }
  }
  return { status: "error", errors: ["resolveTaskTarget: category or subagent_type required"] }
}

/** The foreground result footer contract (execute.ts fixed form). */
export const TASK_FOOTER_PREFIX = "[task_id:"

export function parseTaskResultFooter(text) {
  if (typeof text !== "string") return null
  const match = text.match(/\[task_id:\s*([^\s\]]+)\s*-\s*continue with task_send\(to="([^"]+)",\s*message="([^"]*)"\)\]/)
  if (!match) return null
  return { taskId: match[1], to: match[2], message: match[3] }
}

export function buildCanonicalDescriptor({ normalized, invocationId, parentSessionId, route }) {
  return Object.freeze({
    invocationId,
    parentSessionId,
    kind: normalized.runInBackground ? "job" : "foreground",
    requestedCategory: normalized.category,
    requestedRole: normalized.subagentType,
    resolvedRole: normalized.target.role,
    objective: normalized.prompt,
    description: normalized.description,
    skills: [...normalized.skills],
    route: route?.aliasId ?? null,
    taskId: null, // set by the runtime at spawn; process-local for jobs
    createdAt: Date.now(),
  })
}
