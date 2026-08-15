// omo-dsh role tool policy registry (OMO-0404).
// Verified against fixed-SHA source, LAYERED contract:
//   1. agent files (prompt-side maps, e.g. PROMETHEUS_PERMISSION)
//   2. plugin-handlers/tool-config-handler.ts applyToolConfig() — the
//      config-build overrides that WIN at runtime:
//        - TASK_DENIED_SUBAGENT_KEYS = librarian/explore/oracle/
//          multimodal-looker/metis/momus  → task:"deny"
//        - atlas: task/task_*/teammate allow, call_omo_agent deny,
//          todowrite/todoread deny (task system on); write/edit NOT denied
//        - hephaestus: task/teammate allow, call_omo_agent deny,
//          todowrite/todoread deny (no task_* line)
//        - prometheus: task/task_*/teammate allow, call_omo_agent deny,
//          todowrite/todoread deny, bash:deny, interactive_bash:deny
//        - sisyphus: task/task_*/teammate allow, call_omo_agent deny,
//          todowrite/todoread deny, question per mode
//        - junior: task_*/teammate allow, todowrite/todoread deny;
//          global config.permission.task:"deny" applies to junior;
//          call_omo_agent stays at the agent-source value (allowed) — this is
//          the research-delegation path, NOT task.
//        - librarian: grep_app_* allow; looker: task deny, look_at deny
//        - global: webfetch/external_directory allow, task deny
//   3. prometheus-md-only hook narrows Write/Edit to .omo/*.md (guard layer).
// Defaults below model OpenCode's permissive-unless-denied runtime.
import { resolveToolDecision } from "../compat/tools.mjs"

export const STAGED_TOOL_CATALOG = Object.freeze([
  "read", "grep", "glob", "grep_app_*", "lsp_read", "webfetch", "question",
  "write", "edit", "apply_patch", "bash", "interactive_bash", "test",
  "task", "task_*", "task_send", "task_cancel", "task_output",
  "teammate", "call_omo_agent", "look_at",
  "todowrite", "todoread",
  "notepad_append", "plan_update", "evidence_record",
])

const DENY_TODO = ["todowrite", "todoread"]

export const PRIMARY_ROLE_POLICIES = Object.freeze({
  sisyphus: {
    default: "allow",
    rules: [
      { roles: ["sisyphus"], deny: ["call_omo_agent", ...DENY_TODO] },
      { roles: ["sisyphus"], allow: ["task", "task_*", "teammate"] },
    ],
  },
  hephaestus: {
    default: "allow",
    rules: [
      { roles: ["hephaestus"], deny: ["call_omo_agent", ...DENY_TODO] },
      { roles: ["hephaestus"], allow: ["task", "teammate"] },
    ],
  },
  prometheus: {
    default: "allow",
    rules: [
      { roles: ["prometheus"], deny: ["call_omo_agent", "bash", "interactive_bash", ...DENY_TODO] },
      { roles: ["prometheus"], allow: ["task", "task_*", "teammate", "edit", "webfetch", "question"] },
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
    default: "allow",
    compat: {
      default: "allow",
      rules: [
        { roles: ["atlas"], deny: ["call_omo_agent", ...DENY_TODO] },
        { roles: ["atlas"], allow: ["task", "task_*", "teammate"] },
      ],
    },
    "deny-business-files": {
      default: "allow",
      rules: [
        { roles: ["atlas"], deny: ["call_omo_agent", ...DENY_TODO, "write", "edit", "apply_patch"] },
        { roles: ["atlas"], allow: ["task", "task_*", "teammate"] },
      ],
    },
  },
})

export const CHILD_ROLE_POLICIES = Object.freeze({
  explore: { default: "allow", rules: [{ roles: ["explore"], deny: ["task", "write", "edit", "apply_patch", "teammate"] }] },
  librarian: { default: "allow", rules: [{ roles: ["librarian"], deny: ["task", "write", "edit", "apply_patch", "teammate"] }, { roles: ["librarian"], allow: ["grep_app_*"] }] },
  oracle: { default: "allow", rules: [{ roles: ["oracle"], deny: ["task", "write", "edit", "apply_patch", "teammate"] }] },
  "multimodal-looker": { default: "allow", rules: [{ roles: ["multimodal-looker"], deny: ["task", "look_at", "write", "edit", "apply_patch", "teammate"] }] },
  metis: {
    "opencode-compat": {
      default: "allow",
      rules: [
        // config-build layer denies task for metis; agent layer denies writes
        { roles: ["metis"], deny: ["task", "write", "edit", "apply_patch", "teammate"] },
      ],
    },
    "senpi-compat": {
      default: "allow",
      rules: [{ roles: ["metis"], deny: ["task", "task_send", "task_cancel", "task_output", "write", "edit", "apply_patch", "teammate"] }],
    },
  },
  momus: {
    "opencode-compat": {
      default: "allow",
      rules: [{ roles: ["momus"], deny: ["task", "write", "edit", "apply_patch", "teammate"] }],
    },
    "senpi-compat": {
      default: "allow",
      rules: [{ roles: ["momus"], deny: ["task", "task_send", "task_cancel", "task_output", "write", "edit", "apply_patch", "teammate"] }],
      note: "senpi momus has a one-shot policy; invocation shape enforced at the task layer",
    },
  },
  "sisyphus-junior": {
    default: "allow",
    rules: [
      // global config.permission.task:"deny" applies to junior (no task line)
      { roles: ["sisyphus-junior"], deny: ["task", ...DENY_TODO] },
      // agent-source call_omo_agent stays allowed → research delegation path
      { roles: ["sisyphus-junior"], allow: ["call_omo_agent", "task_*", "teammate"] },
    ],
    delegation: {
      researchWhitelist: ["explore", "librarian", "oracle"],
      categoryImplementationRecursion: "deny",
      legacyPath: "call_omo_agent",
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
