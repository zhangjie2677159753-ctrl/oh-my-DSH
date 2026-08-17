import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeDshEvidence, normalizeOmoEvidence, compareEvidence, OMO_LOG_INPUT_CONTRACT } from "./evidence.mjs"

// --- DSH normalizer (real container format) ---

test("normalizeDshEvidence projects the real session.jsonl format", () => {
  const events = [
    { type: "tool/call", data: { name: "read", arguments: "{\"file_path\":\"/dsh/a.ts\"}", callId: "c1" } },
    { type: "omo/role", data: { role: "prometheus", revision: 1 } },
    { type: "tool/call", data: { name: "bash", arguments: "{\"command\":\"ls\"}", callId: "c2" } },
    { type: "todo/write", data: { todos: [{ content: "T1" }] } },
    { type: "assistant/message", data: { message: { content: [{ type: "text", text: "ok" }] } } },
  ]
  const { ok, evidence } = normalizeDshEvidence(events)
  assert.equal(ok, true)
  assert.deepEqual(evidence.toolSequence.map((t) => t.name), ["read", "bash"])
  assert.deepEqual(evidence.roleEvents, [{ role: "prometheus", revision: 1 }])
  assert.deepEqual(evidence.todoWrites, [{ items: 1 }])
  assert.equal(evidence.assistantTurnCount, 1)
})

test("normalizeDshEvidence fails on empty or tool-less logs", () => {
  assert.equal(normalizeDshEvidence([]).ok, false)
  assert.equal(normalizeDshEvidence([{ type: "user/message" }]).ok, false)
})

// --- OMO normalizer (declared input contract) ---

test("normalizeOmoEvidence consumes the declared OpenCode log subset", () => {
  const events = [
    { type: "tool.execute.after", properties: { tool: "read" } },
    { type: "omo/role", data: { role: "sisyphus", revision: 2 } },
    { type: "boulder/write", data: { work: "w1", agent: "sisyphus" } },
    { type: "todo.updated", properties: { items: [{}, {}] } },
    { type: "session.idle", properties: { decision: "continue" } },
    { type: "message.updated", properties: { role: "assistant" } },
    { type: "unknown/event", properties: {} }, // ignored
  ]
  const { ok, evidence } = normalizeOmoEvidence(events)
  assert.equal(ok, true)
  assert.deepEqual(evidence.toolSequence.map((t) => t.name), ["read"])
  assert.deepEqual(evidence.boulderWrites, [{ work: "w1", agent: "sisyphus" }])
  assert.deepEqual(evidence.continuationDecisions, [{ kind: "continue", atTurn: 0 }])
})

test("OMO input contract locks the expected event types", () => {
  assert.equal(OMO_LOG_INPUT_CONTRACT.toolCallEvent.type, "tool.execute.after")
  assert.equal(OMO_LOG_INPUT_CONTRACT.continuationEvent.properties.decision, "continue|stop")
})

// --- comparison engine ---

function dshEvidence() {
  return normalizeDshEvidence([
    { type: "tool/call", data: { name: "read", arguments: "{}", callId: "1" } },
    { type: "tool/call", data: { name: "bash", arguments: "{}", callId: "2" } },
    { type: "omo/role", data: { role: "prometheus", revision: 1 } },
    { type: "todo/write", data: { todos: [{}] } },
  ]).evidence
}
function omoEvidence() {
  return normalizeOmoEvidence([
    { type: "tool.execute.after", properties: { tool: "read" } },
    { type: "tool.execute.after", properties: { tool: "bash" } },
    { type: "omo/role", data: { role: "prometheus", revision: 1 } },
    { type: "todo.updated", properties: { items: [{}] } },
  ]).evidence
}

test("compareEvidence passes on machine-exact parity", () => {
  const result = compareEvidence(omoEvidence(), dshEvidence(), { toolEquivalence: { read: 'read', bash: 'bash' } })
  assert.equal(result.pass, true)
  assert.equal(result.parityBreaks, 0)
})

test("compareEvidence flags tool-sequence parity breaks", () => {
  const dsh = dshEvidence()
  dsh.toolSequence = dsh.toolSequence.slice().reverse()
  dsh.toolCalls = dsh.toolCalls.slice().reverse()
  const result = compareEvidence(omoEvidence(), dsh)
  assert.equal(result.pass, false)
  assert.ok(result.findings.some((f) => f.kind === "parity-break" && f.detail.includes("tool sequence")))
})

test("compareEvidence honors registered documented deviations", () => {
  const dsh = dshEvidence()
  const omo = omoEvidence()
  dsh.toolSequence = [{ name: "glob", order: 1, argsDigest: null }, { name: "bash", order: 2, argsDigest: null }]
  const result = compareEvidence(omo, dsh, {
    toolEquivalence: { read: 'read', bash: 'bash', glob: 'glob' },
    documentedDeviations: [{
      id: "DEV-1",
      kind: "tool-sequence",
      omo: JSON.stringify(["read", "bash"]),
      dsh: JSON.stringify(["glob", "bash"]),
      note: "glob replaces read",
    }],
  })
  assert.equal(result.pass, true)
  assert.equal(result.matchedDeviations, 1)
})

test("compareEvidence treats call counts as semantic-tolerant within tolerance", () => {
  const eq = { read: 'read', bash: 'bash' }
  const dsh = dshEvidence()
  dsh.toolCalls.push({ toolName: "glob", argsDigest: null, callId: "3" })
  const within = compareEvidence(omoEvidence(), dsh, { callCountTolerance: 2, toolEquivalence: eq })
  assert.equal(within.semanticDivergences, 0)
  dsh.toolCalls.push({ toolName: "glob", argsDigest: null, callId: "4" }, { toolName: "glob", argsDigest: null, callId: "5" })
  const outside = compareEvidence(omoEvidence(), dsh, { callCountTolerance: 2, toolEquivalence: eq })
  assert.equal(outside.semanticDivergences, 1)
})

test("compareEvidence flags role-sequence and todo-count breaks", () => {
  const dsh = dshEvidence()
  dsh.roleEvents = [{ role: "atlas", revision: 1 }]
  const r = compareEvidence(omoEvidence(), dsh)
  assert.equal(r.pass, false)
  assert.ok(r.findings.some((f) => f.detail.includes("role sequence")))

  const dsh2 = dshEvidence()
  dsh2.todoWrites = []
  const r2 = compareEvidence(omoEvidence(), dsh2)
  assert.ok(r2.findings.some((f) => f.detail.includes("todo write")))
})
