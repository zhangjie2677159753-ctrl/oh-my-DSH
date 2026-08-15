// omo-dsh child → DSH launch request mapper (E10 binding half), pure part.
// Produces an owned DSH-child request DTO with fail-before-launch validation:
// - continuable children reject outputSchema (fixed DSH contract)
// - every requested capability must be declared by the provider
// - tool visibility and execution restriction are the SAME list
import { assertSubagentLaunch, assertContinuableLaunch } from "../compat/subagents.mjs"
import { resolveChildSpec, toLaunchSpec } from "./registry.mjs"

export function buildChildRequest({ role, profile = "opencode-compat", mode = "one-shot", capabilities = [], parentSessionId, maxDepth = null, outputSchema = null }) {
  const resolved = resolveChildSpec({ role, profile })
  if (resolved.status !== "ok") return { ok: false, errors: resolved.errors, request: null }
  return buildChildRequestFromSpec({
    spec: toLaunchSpec(resolved),
    mode,
    capabilities,
    parentSessionId,
    maxDepth,
    outputSchema,
  })
}

export function buildChildRequestFromSpec({ spec, mode = "one-shot", capabilities = [], parentSessionId, maxDepth = null, outputSchema = null }) {
  const errors = []
  if (typeof parentSessionId !== "string" || parentSessionId.length === 0) {
    errors.push("parentSessionId: required")
  }
  const requested = { persona: `omo-child:${spec.role}` }
  if (maxDepth !== null && maxDepth !== undefined) requested.depthLimit = maxDepth
  if (outputSchema !== null && outputSchema !== undefined) requested.outputSchema = outputSchema
  const provider = { id: "dsh-child-provider", capabilities }
  try {
    if (mode === "continuable") assertContinuableLaunch(provider, requested)
    else assertSubagentLaunch(provider, requested)
  } catch (error) {
    errors.push(error.message)
  }
  return {
    ok: errors.length === 0,
    errors,
    request: errors.length === 0 ? Object.freeze({
      kind: mode === "continuable" ? "continuable-session" : "one-shot",
      parentSessionId,
      role: spec.role,
      profile: spec.profile,
      persona: requested.persona,
      maxDepth,
      outputSchema: mode === "continuable" ? null : outputSchema,
      // visibility == execution: one identical restriction list
      toolFilter: Object.freeze({ allow: [...spec.toolFilter.allow], deny: [...spec.toolFilter.deny] }),
      delegationWhitelist: spec.delegationWhitelist,
    }) : null,
  }
}
