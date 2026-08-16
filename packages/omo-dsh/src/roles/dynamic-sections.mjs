// omo-dsh dynamic role prompt sections (G6/E04 content half), pure part.
// Builds the per-role section CONTENT the plugin registers with
// ctx.systemPrompt.section(...) at runtime (registration stays in
// dsh-plugin/omo-role-plugin.mjs; the static omo:identity section is already
// live). Ordering: omo:identity(-50) < current-role(-40) < guard-status(-30)
// < work(-20) < persona(0).

export const DYNAMIC_SECTION_ORDERS = Object.freeze({
  "omo:current-role": -40,
  "omo:guard-status": -30,
  "omo:work": -20,
})

/**
 * Current-role section: which primary role is live, at which revision, and
 * what it means in one line. Never claims a revision that is not given.
 */
export function buildRoleStateSection({ role, revision = null, modelFamily = "deepseek-v4" } = {}) {
  const rev = revision === null ? "" : ` (revision ${revision})`
  return {
    name: "omo:current-role",
    order: DYNAMIC_SECTION_ORDERS["omo:current-role"],
    text: `Current OMO role: ${role}${rev}; model family: ${modelFamily}.`,
  }
}

/**
 * Guard-status section from guard-decision outputs: lists every active
 * denial so the model sees its own permission boundary BEFORE calling tools.
 * decideTool returns {allow:false, reason:"omo role <role> denies <tool>"};
 * the tool name is recovered from that reason when not given explicitly.
 * Empty denial list produces a minimal "no denials active" line.
 */
export function buildGuardSummarySection({ denials = [] } = {}) {
  const lines = denials
    .filter((d) => d && d.allow === false)
    .map((d) => {
      const m = /denies\s+([a-zA-Z0-9_-]+)/.exec(d.reason ?? "")
      const tool = d.toolName ?? m?.[1] ?? "tool"
      return `- ${tool}: denied (${d.reason ?? "policy"})`
    })
  const body = lines.length > 0 ? lines.join("\n") : "- none: standard role policy applies"
  return {
    name: "omo:guard-status",
    order: DYNAMIC_SECTION_ORDERS["omo:guard-status"],
    text: `Active guard denials:\n${body}`,
  }
}

/**
 * Work section from the Boulder projection: current work id + agent + next
 * step. Kept one-line; the full projection is data injected separately
 * (omo:catalog), never duplicated here.
 */
export function buildWorkSection({ work = null } = {}) {
  const text = work
    ? `Active work: ${work.id} (agent: ${work.agent ?? "unassigned"})`
    : "Active work: none."
  return {
    name: "omo:work",
    order: DYNAMIC_SECTION_ORDERS["omo:work"],
    text,
  }
}

/**
 * Ordered dynamic section set for one step. Ordering is stable regardless of
 * input shape; unknown inputs degrade to minimal honest text, never throw.
 */
export function buildDynamicSections({ roleState = {}, guardState = {}, workState = {} } = {}) {
  return [
    buildRoleStateSection(roleState),
    buildGuardSummarySection(guardState),
    buildWorkSection(workState),
  ]
}
