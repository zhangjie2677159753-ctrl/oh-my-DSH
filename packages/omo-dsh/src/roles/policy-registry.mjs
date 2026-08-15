// omo-dsh role tool policy registry (OMO-0404).
// Verified OMO contracts at fixed SHA:
// - Atlas compat: task/task_*/teammate allowed, call_omo_agent denied
//   (tool-config-handler.ts); current source does NOT deny all write/edit —
//   that is the dsh-hardened profile, reported separately.
// - Prometheus: permission map allows edit/bash/webfetch/question; the
//   prometheus-md-only guard narrows Write/Edit to .omo/*.md and injects a
//   planning warning into task delegation (hook.ts BLOCKED_TOOLS).
// - Metis/Momus (OpenCode): deny write/edit/apply_patch, keep task delegation;
//   Senpi profile: Metis also denies delegation.
// Startup validation fails loud on unknown tool names and allow∩deny conflicts.

export const STAGED_TOOL_CATALOG = Object.freeze([
  "read", "grep", "glob", "lsp_read", "webfetch", "question",
  "write", "edit", "apply_patch", "bash", "test",
  "task", "task_*", "task_send", "task_cancel", "task_output",
  "teammate", "call_omo_agent",
  "notepad_append", "plan_update", "evidence_record",
])

export const PRIMARY_ROLE_POLICIES = Object.freeze({
  sisyphus: { default: "allow" },
  hephaestus: { default: "allow" },
  prometheus: {
    default: "deny",
    rules: [
      { roles: ["prometheus"], allow: ["edit", "bash", "webfetch", "question"] },
    ],
    fileGuard: {
      profile: "prometheus-md-only",
      blockedTools: ["write", "edit"],
      allowedPathPrefix: ".omo",
      allowedExtension: ".md",
      taskWarning: "planning-only-consult",
    },
  },
  atlas: {
    default: "deny",
    compat: {
      rules: [
        { roles: ["atlas"], allow: ["task", "task_*", "teammate"] },
        { roles: ["atlas"], deny: ["call_omo_agent"] },
      ],
    },
    "deny-business-files": {
      rules: [
        { roles: ["atlas"], allow: ["task", "task_*", "teammate"] },
        { roles: ["atlas"], deny: ["call_omo_agent", "write", "edit", "apply_patch"] },
      ],
    },
  },
})

export const CHILD_ROLE_POLICIES = Object.freeze({
  explore: { default: "deny", rules: [{ roles: ["explore"], allow: ["read", "grep", "glob", "lsp_read"] }] },
  librarian: { default: "deny", rules: [{ roles: ["librarian"], allow: ["read", "grep", "glob", "webfetch"] }] },
  oracle: { default: "deny", rules: [{ roles: ["oracle"], allow: ["read", "grep", "glob"] }] },
  "multimodal-looker": { default: "deny", rules: [{ roles: ["multimodal-looker"], allow: ["read", "glob", "webfetch"] }] },
  metis: {
    "opencode-compat": {
      default: "deny",
      rules: [
        { roles: ["metis"], allow: ["read", "grep", "glob", "task"] },
        { roles: ["metis"], deny: ["write", "edit", "apply_patch"] },
      ],
    },
    "senpi-compat": {
      default: "deny",
      rules: [
        { roles: ["metis"], allow: ["read", "grep", "glob"] },
        { roles: ["metis"], deny: ["write", "edit", "apply_patch", "task"] },
      ],
    },
  },
  momus: {
    "opencode-compat": {
      default: "deny",
      rules: [
        { roles: ["momus"], allow: ["read", "grep", "glob", "task"] },
        { roles: ["momus"], deny: ["write", "edit", "apply_patch"] },
      ],
    },
    "senpi-compat": {
      default: "deny",
      rules: [
        { roles: ["momus"], allow: ["read", "grep", "glob"] },
        { roles: ["momus"], deny: ["write", "edit", "apply_patch"] },
      ],
      note: "senpi momus has a one-shot policy; invocation shape enforced at the task layer",
    },
  },
  "sisyphus-junior": {
    default: "deny",
    rules: [
      { roles: ["sisyphus-junior"], allow: ["read", "grep", "glob", "lsp_read", "webfetch", "write", "edit", "apply_patch", "bash", "test", "task"] },
      { roles: ["sisyphus-junior"], deny: ["teammate", "call_omo_agent", "task_send", "task_cancel"] },
    ],
    delegation: {
      researchWhitelist: ["explore", "librarian", "oracle"],
      categoryImplementationRecursion: "deny",
    },
  },
  "plan-compiler": { default: "deny", rules: [{ roles: ["plan-compiler"], allow: [] }] },
})

export function validateRegistry(catalog, registry) {
  const errors = []
  const catalogSet = new Set(catalog)
  const checkPolicy = (path, policy) => {
    for (const rule of policy.rules ?? []) {
      const names = [...(rule.allow ?? []), ...(rule.deny ?? [])]
      for (const tool of names) {
        if (!catalogSet.has(tool)) errors.push(`${path}: tool "${tool}" not in catalog`)
      }
      const allow = new Set(rule.allow ?? [])
      for (const tool of rule.deny ?? []) {
        if (allow.has(tool)) errors.push(`${path}: tool "${tool}" both allowed and denied in one rule`)
      }
    }
  }
  for (const [role, policy] of Object.entries(registry)) {
    const variants = policy.compat !== undefined || policy["deny-business-files"] !== undefined
    if (variants) {
      for (const [variant, p] of Object.entries(policy)) {
        if (["default", "rules", "fileGuard", "delegation", "note"].includes(variant)) continue
        checkPolicy(`${role}.${variant}`, p)
      }
    } else {
      checkPolicy(role, policy)
    }
  }
  return errors
}

/**
 * Prometheus write-path guard (prometheus-md-only compat contract):
 * Write/Edit tools are permitted only for `.omo/*.md` files. Delegation tools
 * get a planning-only warning, never a blanket deny.
 */
export function prometheusFileGuard(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return { allowed: false, reason: "empty path" }
  const normalized = filePath.toLowerCase().replace(/\\/g, "/")
  if (normalized.startsWith(".omo") && normalized.endsWith(".md")) {
    return { allowed: true, reminder: normalized.includes(".omo/plans/") ? "plan-write-workflow-reminder" : undefined }
  }
  return {
    allowed: false,
    reason: "Prometheus is a planning agent. File operations restricted to .omo/*.md plan files only. Do NOT route this change through a subagent either.",
  }
}
