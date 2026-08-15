// omo-dsh child role registry (E10), pure part.
// Builds owned child specs from the verified policy registry for BOTH
// compatibility profiles. The runtime layer feeds these specs into DSH child
// personas/tool filters; visibility and execution are governed by the same
// policy — never by prompt text alone.
import { CHILD_ROLE_POLICIES } from "../roles/policy-registry.mjs"
import { resolveToolDecision } from "../compat/tools.mjs"

export const CHILD_PROFILES = Object.freeze(["opencode-compat", "senpi-compat"])

export function resolveChildSpec({ role, profile = "opencode-compat" }) {
  if (!(role in CHILD_ROLE_POLICIES)) {
    return { status: "error", errors: [`child role "${role}": unknown`] }
  }
  if (!CHILD_PROFILES.includes(profile)) {
    return { status: "error", errors: [`profile "${profile}": expected ${CHILD_PROFILES.join("|")}`] }
  }
  const entry = CHILD_ROLE_POLICIES[role]
  const policy = entry[profile] ?? entry
  return {
    status: "ok",
    role,
    profile,
    policy,
    delegation: entry.delegation ?? null,
    note: entry.note ?? null,
    decisionFor: (tool) => resolveToolDecision(policy, role, tool),
  }
}

export function buildChildRegistry({ profile = "opencode-compat" } = {}) {
  const errors = []
  const specs = {}
  for (const role of Object.keys(CHILD_ROLE_POLICIES)) {
    const spec = resolveChildSpec({ role, profile })
    if (spec.status !== "ok") errors.push(...spec.errors)
    else specs[role] = spec
  }
  if (Object.keys(specs).length !== Object.keys(CHILD_ROLE_POLICIES).length) {
    errors.push("child registry incomplete")
  }
  return { ok: errors.length === 0, errors, specs, profile }
}

/** Owned launch spec: everything the DSH subagent adapter needs, nothing live. */
export function toLaunchSpec(spec, { toolFilter = null } = {}) {
  if (spec.status !== "ok") throw new TypeError("toLaunchSpec: spec not ok")
  return Object.freeze({
    role: spec.role,
    profile: spec.profile,
    toolFilter: toolFilter ?? Object.freeze({
      allow: ["read", "grep", "glob", "lsp_read", "webfetch", "write", "edit", "apply_patch", "bash", "test", "task", "task_*", "task_send", "task_cancel", "task_output", "teammate", "call_omo_agent"].filter((tool) => spec.decisionFor(tool).decision === "allow"),
      deny: ["task", "task_*", "task_send", "task_cancel", "task_output", "teammate", "call_omo_agent", "write", "edit", "apply_patch"].filter((tool) => spec.decisionFor(tool).decision === "deny"),
    }),
    delegationWhitelist: spec.delegation?.researchWhitelist ?? null,
  })
}
