// omo-dsh differential replay evidence layer (G4), pure part.
// Both sides project to ONE normalized evidence schema; comparison rules come
// from docs/plans/DIFFERENTIAL-REPLAY-PLAN.md §4:
//   machine-exact    : tool NAME sequence, role switch order, boulder/todo
//                      write facts, continuation decision kinds
//   semantic-tolerant: tool call counts, args details (digests may differ)
//   documented-deviation: pre-registered divergence list
// DSH-side normalizer consumes the container session.jsonl (real format,
// exercised by the live eval). OMO-side normalizer consumes an OpenCode
// event-log subset DECLARED below — verify against a real OpenCode export
// before executing the replay (plan §7 readiness).

export const EVIDENCE_SCHEMA_VERSION = 1

/** Input contract for the OMO-side normalizer (verify before real replay). */
export const OMO_LOG_INPUT_CONTRACT = Object.freeze({
  toolCallEvent: { type: "tool.execute.after", properties: { tool: "string" } },
  roleEvent: { type: "omo/role", data: { role: "string", revision: "number" } },
  boulderEvent: { type: "boulder/write", data: { work: "string", agent: "string" } },
  todoEvent: { type: "todo.updated", properties: { items: "array" } },
  continuationEvent: { type: "session.idle", properties: { decision: "continue|stop" } },
  assistantMessage: { type: "message.updated", properties: { role: "assistant" } },
})

export function normalizeToolSequence(events) {
  return events.filter((e) => e?.toolName).map((e, i) => ({ name: e.toolName, order: i + 1, argsDigest: e.argsDigest ?? null }))
}

/**
 * Normalize the DSH container session.jsonl to the shared schema.
 * Returns { ok, evidence } | { ok:false, errors }.
 */
export function normalizeDshEvidence(sessionEvents) {
  const errors = []
  if (!Array.isArray(sessionEvents) || sessionEvents.length === 0) return { ok: false, errors: ["sessionEvents: expected non-empty array"] }
  const toolCalls = []
  const roleEvents = []
  const todoWrites = []
  let assistantTurns = 0
  for (const ev of sessionEvents) {
    if (!ev || typeof ev.type !== "string") { errors.push("event missing type"); continue }
    if (ev.type === "tool/call") {
      let argsDigest = null
      try { argsDigest = typeof ev.data?.arguments === "string" ? ev.data.arguments : JSON.stringify(ev.data?.arguments ?? {}) } catch { argsDigest = String(ev.data?.arguments ?? "") }
      toolCalls.push({ toolName: ev.data?.name ?? "?", argsDigest, callId: ev.data?.callId ?? null })
    }
    if (ev.type === "omo/role") roleEvents.push({ role: ev.data?.role ?? null, revision: ev.data?.revision ?? null })
    if (ev.type === "todo/write") todoWrites.push({ items: Array.isArray(ev.data?.todos) ? ev.data.todos.length : 0 })
    if (ev.type === "assistant/message") assistantTurns += 1
  }
  if (toolCalls.length === 0) return { ok: false, errors: ["no tool calls in session log"], evidence: null }
  return {
    ok: true,
    errors: [],
    evidence: {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      toolCalls,
      toolSequence: normalizeToolSequence(toolCalls),
      roleEvents,
      todoWrites,
      continuationDecisions: [],
      boulderWrites: [],
      assistantTurnCount: assistantTurns,
      finalWorkState: "unknown",
    },
  }
}

/**
 * Normalize an OMO OpenCode event-log subset per the declared input contract.
 * Unknown events are ignored; a log with zero recognizable events fails.
 */
export function normalizeOmoEvidence(events) {
  const errors = []
  if (!Array.isArray(events) || events.length === 0) return { ok: false, errors: ["events: expected non-empty array"] }
  const toolCalls = []
  const roleEvents = []
  const todoWrites = []
  const continuationDecisions = []
  const boulderWrites = []
  let assistantTurns = 0
  for (const ev of events) {
    if (!ev || typeof ev.type !== "string") continue
    if (ev.type === OMO_LOG_INPUT_CONTRACT.toolCallEvent.type) {
      const tool = ev.properties?.tool
      if (typeof tool === "string") toolCalls.push({ toolName: tool, argsDigest: null, callId: null })
    }
    if (ev.type === "omo/role") roleEvents.push({ role: ev.data?.role ?? null, revision: ev.data?.revision ?? null })
    if (ev.type === "boulder/write") boulderWrites.push({ work: ev.data?.work ?? null, agent: ev.data?.agent ?? null })
    if (ev.type === "todo.updated") todoWrites.push({ items: Array.isArray(ev.properties?.items) ? ev.properties.items.length : 0 })
    if (ev.type === "session.idle") {
      const decision = ev.properties?.decision
      if (decision === "continue" || decision === "stop") continuationDecisions.push({ kind: decision, atTurn: assistantTurns })
    }
    if (ev.type === "message.updated" && ev.properties?.role === "assistant") assistantTurns += 1
  }
  if (toolCalls.length === 0) return { ok: false, errors: ["no tool calls in OMO log"], evidence: null }
  return {
    ok: true,
    errors,
    evidence: {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      toolCalls,
      toolSequence: normalizeToolSequence(toolCalls),
      roleEvents,
      todoWrites,
      continuationDecisions,
      boulderWrites,
      assistantTurnCount: assistantTurns,
      finalWorkState: "unknown",
    },
  }
}

/**
 * Compare two normalized evidence objects per the plan's rules.
 * documentedDeviations: [{ name, kind: 'tool-sequence'|'role-sequence'|..., note }]
 * machine-exact rows are compared exactly; tool CALL COUNTS are
 * semantic-tolerant (compared with tolerance), args never compared.
 */
export function compareEvidence(omo, dsh, { documentedDeviations = [], callCountTolerance = 2 } = {}) {
  const findings = []
  const matchedDeviations = new Set()
  const push = (kind, detail) => findings.push({ kind, detail })

  // machine-exact: tool name sequence
  const omoSeq = omo.toolSequence.map((t) => t.name)
  const dshSeq = dsh.toolSequence.map((t) => t.name)
  if (JSON.stringify(omoSeq) !== JSON.stringify(dshSeq)) {
    const dev = documentedDeviations.find((d) => d.kind === "tool-sequence" && d.omo === JSON.stringify(omoSeq) && d.dsh === JSON.stringify(dshSeq))
    if (dev) matchedDeviations.add(dev.id)
    else push("parity-break", `tool sequence mismatch: omo=${omoSeq.join(",") || "—"} dsh=${dshSeq.join(",") || "—"}`)
  }

  // machine-exact: role switch order
  const omoRoles = omo.roleEvents.map((r) => r.role)
  const dshRoles = dsh.roleEvents.map((r) => r.role)
  if (JSON.stringify(omoRoles) !== JSON.stringify(dshRoles)) {
    const dev = documentedDeviations.find((d) => d.kind === "role-sequence" && d.omo === JSON.stringify(omoRoles) && d.dsh === JSON.stringify(dshRoles))
    if (dev) matchedDeviations.add(dev.id)
    else push("parity-break", `role sequence mismatch: omo=${JSON.stringify(omoRoles)} dsh=${JSON.stringify(dshRoles)}`)
  }

  // machine-exact: todo write counts
  if (omo.todoWrites.length !== dsh.todoWrites.length) {
    push("parity-break", `todo write count mismatch: omo=${omo.todoWrites.length} dsh=${dsh.todoWrites.length}`)
  }

  // machine-exact: boulder writes (only when OMO side recorded them)
  if (omo.boulderWrites.length > 0 && dsh.boulderWrites.length !== omo.boulderWrites.length) {
    push("parity-break", `boulder write count mismatch: omo=${omo.boulderWrites.length} dsh=${dsh.boulderWrites.length}`)
  }

  // machine-exact: continuation decision kinds
  const omoDec = omo.continuationDecisions.map((d) => d.kind)
  const dshDec = dsh.continuationDecisions.map((d) => d.kind)
  if (omoDec.length > 0 && JSON.stringify(omoDec) !== JSON.stringify(dshDec)) {
    push("parity-break", `continuation decision mismatch: omo=${JSON.stringify(omoDec)} dsh=${JSON.stringify(dshDec)}`)
  }

  // semantic-tolerant: tool call counts within tolerance
  if (Math.abs(omo.toolCalls.length - dsh.toolCalls.length) > callCountTolerance) {
    push("semantic-divergence", `tool call counts outside tolerance ${callCountTolerance}: omo=${omo.toolCalls.length} dsh=${dsh.toolCalls.length}`)
  }

  const parityBreaks = findings.filter((f) => f.kind === "parity-break").length
  return {
    pass: parityBreaks === 0,
    parityBreaks,
    semanticDivergences: findings.filter((f) => f.kind === "semantic-divergence").length,
    matchedDeviations: matchedDeviations.size,
    unregisteredDeviations: findings.filter((f) => f.kind === "parity-break").length,
    findings,
  }
}

/**
 * Normalize OMO-side OpenCode DB parts (the REAL persisted format at CLI
 * 1.15.13): messages [{role, parts:[{type, tool, status, input, text}]}].
 * Tool parts become the tool sequence; assistant messages count as turns;
 * role events are absent from the part stream (recorded empty — the compare
 * engine flags any role-sequence mismatch honestly).
 */
export function normalizeOmoParts(messages) {
  const errors = []
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, errors: ['messages: expected non-empty array'] }
  const toolCalls = []
  let assistantTurns = 0
  for (const message of messages) {
    if (message?.role === 'assistant') assistantTurns += 1
    for (const part of message?.parts ?? []) {
      if (part?.type === 'tool' && typeof part.tool === 'string') {
        toolCalls.push({ toolName: part.tool, argsDigest: null, callId: null })
      }
    }
  }
  if (toolCalls.length === 0) return { ok: false, errors: ['no tool calls in OMO parts'], evidence: null }
  return {
    ok: true,
    errors,
    evidence: {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      toolCalls,
      toolSequence: normalizeToolSequence(toolCalls),
      roleEvents: [],
      todoWrites: [],
      continuationDecisions: [],
      boulderWrites: [],
      assistantTurnCount: assistantTurns,
      finalWorkState: 'unknown',
    },
  }
}
