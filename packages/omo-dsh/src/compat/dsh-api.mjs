// omo-dsh compat seam (OMO-0201): fail-closed capability probe manifest.
// Real DSH imports live only in this directory; before any DSH integration runs,
// the hosting composition must provide a capability report and satisfy every
// REQUIRED capability below. Missing capabilities must stop startup loudly.
// Stage A: pure data + pure functions, no DSH imports yet.

export const REQUIRED_CAPABILITIES = Object.freeze([
  "session.append",
  "session.flush",
  "session.event",
  "session.seed-replay",
  "system-prompt.sections",
  "system-prompt.context",
  "system-prompt.variable",
  "tools.pre-execute",
  "tools.execute",
  "tools.post-execute",
  "tools.guard",
  "agent.request",
  "agent.request-error",
  "agent.steer",
  "agent.turn-stopping",
  "subagent.one-shot",
  "subagent.continuable",
  "subagent.job",
  "subagent.send-message",
  "subagent.interrupt",
  "goal.change",
  "todo.write",
  "compaction.basic",
  "preset.lookup",
  "preset.generation-pin",
])

export const OPTIONAL_CAPABILITIES = Object.freeze([
  "subagent.output-schema",
  "client.projections",
  "client.slots",
  "mcp.client",
  "lsp.tool",
  "terminal.tool",
])

const ALL_KNOWN = new Set([...REQUIRED_CAPABILITIES, ...OPTIONAL_CAPABILITIES])

export function probeReport(provided = []) {
  const seen = new Set(provided)
  const unknown = [...seen].filter((c) => !ALL_KNOWN.has(c))
  const missing = REQUIRED_CAPABILITIES.filter((c) => !seen.has(c))
  const optional = OPTIONAL_CAPABILITIES.filter((c) => seen.has(c))
  return {
    ok: missing.length === 0,
    missing,
    optional,
    unknown,
  }
}

export function assertCapabilities(report) {
  if (!report || !Array.isArray(report.missing)) {
    throw new Error("assertCapabilities: expected a probeReport() result")
  }
  if (report.unknown.length > 0) {
    throw new Error(`assertCapabilities: unknown capability names ${report.unknown.join(", ")}`)
  }
  if (!report.ok) {
    throw new Error(`assertCapabilities: missing required DSH capabilities: ${report.missing.join(", ")}`)
  }
  return report
}
