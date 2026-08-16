// omo-dsh spawn-request mapper (E09 binding half), pure part.
// Maps a canonical OMO descriptor + child launch spec onto the verified
// DSH SubagentStartRequest vocabulary:
//   { label?, prompt: ContentBlock[], parent, signal, agentOptions?,
//     outputSchema?, maxDepth?, toolFilter?: ToolRestriction{allow,deny}, persona? }
// Capability gating reuses the compat fail-before-launch assertions; the
// output is an OWNED DTO (lossless JSON) ready for the runtime layer.
import { validateSubagentCapabilities } from "../compat/subagents.mjs"
import { resolveChildSpec, toLaunchSpec } from "../children/registry.mjs"

export function buildSpawnRequest({ descriptor, childRole, profile = "opencode-compat", providerCapabilities, promptBlocks, signal = "runtime-supplied", maxDepth = null, outputSchema = null, label = null }) {
  const errors = []
  const resolved = resolveChildSpec({ role: childRole, profile })
  if (resolved.status !== "ok") return { ok: false, errors: resolved.errors, request: null }
  const spec = toLaunchSpec(resolved)

  const requested = {}
  if (maxDepth !== null && maxDepth !== undefined) requested.depthLimit = maxDepth
  if (outputSchema !== null && outputSchema !== undefined) requested.outputSchema = outputSchema
  const missing = validateSubagentCapabilities({ id: "provider", capabilities: providerCapabilities }, { ...requested, persona: `omo-child:${childRole}`, toolFilter: {} })
  if (missing.length > 0) errors.push(...missing.map((cap) => `provider lacks ${cap}`))

  if (!Array.isArray(promptBlocks) || promptBlocks.length === 0) errors.push("promptBlocks: required non-empty array")

  const request = {
    kind: descriptor.kind,
    label: label ?? `omo ${childRole} ${descriptor.invocationId}`,
    prompt: promptBlocks,
    parent: descriptor.parentSessionId,
    signal,
    maxDepth,
    outputSchema: descriptor.kind === "continuable-session" ? null : outputSchema,
    toolFilter: { allow: [...spec.toolFilter.allow], deny: [...spec.toolFilter.deny] },
    persona: `omo-child:${childRole}`,
    role: childRole,
    profile,
  }
  return { ok: errors.length === 0, errors, request }
}

/** Owned prompt blocks: text blocks only for the initial child user message. */
export function promptTextBlock(text) {
  return [{ type: "text", text: String(text) }]
}
