import test from "node:test"
import assert from "node:assert/strict"
import { parsePlanChecklist, planProgress } from "../src/boulder/plan-checklist.mjs"
import { migrateBoulderState, validateBoulderState, addTaskSession, normalizeSessionId } from "../src/boulder/state.mjs"

// --- plan checklist exact grammar ---

const plan = [
  "## TODOs",
  "- [ ] 1. Task one",
  "- [x] 2. Task two",
  "- [ ] 3. Task three",
  "",
  "## Final Verification Wave",
  "- [ ] F1. Run the full suite",
  "",
].join("\n")

test("structured parse: entries, next, keys", () => {
  const c = parsePlanChecklist(plan)
  assert.equal(c.structuredSeen, true)
  assert.deepEqual(c.todos.map((t) => t.key), ["todo:1", "todo:2", "todo:3"])
  assert.deepEqual(c.finalWave.map((f) => f.key), ["final-wave:f1"])
  assert.deepEqual(c.next, { key: "todo:1", label: "1. Task one", checked: false })
})

test("next task is the first unchecked in document order; final wave counts", () => {
  const p = planProgress(parsePlanChecklist(plan))
  assert.deepEqual({ ...p, next: p.next?.key }, { total: 4, completed: 1, finalWaveCompleted: 0, finalWaveTotal: 1, next: "todo:1" })
})

test("final wave is mandatory: all TODOs checked but F1 open means not complete", () => {
  const done = "## TODOs\n- [x] 1. A\n## Final Verification Wave\n- [ ] F1. Verify\n"
  const c = parsePlanChecklist(done)
  const progress = planProgress(c)
  assert.equal(progress.completed, 1)
  assert.equal(progress.total, 2)
  assert.equal(c.next.key, "final-wave:f1")
})

test("fenced code, nested boxes, and star bullets never count", () => {
  const tricky = [
    "## TODOs",
    "```",
    "- [ ] 9. fenced fake",
    "```",
    "  - [ ] 1. nested fake",
    "* [ ] 2. star bullet fake",
    "- [ ] 0. zero label invalid",
    "- [ ] 2. real two",
  ].join("\n")
  const c = parsePlanChecklist(tricky)
  assert.deepEqual(c.todos.map((t) => t.key), ["todo:2"])
})

test("a new H2 section ends the current section", () => {
  const source = "## TODOs\n- [ ] 1. A\n## Other Heading\n- [ ] 2. B\n"
  const c = parsePlanChecklist(source)
  assert.deepEqual(c.todos.map((t) => t.key), ["todo:1"])
})

test("no structured headings → no entries, no fallback mixing", () => {
  const loose = "- [ ] 1. A\n- [x] 2. B\n"
  const c = parsePlanChecklist(loose)
  assert.equal(c.structuredSeen, false)
  assert.equal(c.todos.length, 0)
  assert.equal(c.next, null)
})

// --- boulder state ---

test("legacy round-trip preserves unknown fields and mirrors v2", () => {
  const legacy = {
    active_plan: "plan-a",
    plan_name: "plan-a",
    status: "active",
    agent: "atlas",
    session_ids: ["abc"],
    session_origins: ["direct"],
    started_at: 1000,
    legacyCustomField: { keep: true },
  }
  const out = migrateBoulderState(legacy)
  assert.equal(out.schema_version, 2)
  assert.equal(out.legacyCustomField.keep, true)
  assert.equal(out.works["work-1"].plan_name, "plan-a")
  assert.equal(out.active_plan, "plan-a")
})

test("invalid statuses and dangling active_work_id fail closed", () => {
  assert.ok(validateBoulderState({ works: { w1: { status: "done" } } }).some((e) => e.includes("unknown")))
  assert.ok(validateBoulderState({ schema_version: 3 }).some((e) => e.includes("schema_version")))
  assert.ok(validateBoulderState({ active_work_id: "w2", works: { w1: { status: "active" } } }).length > 0)
})

test("task sessions normalize ids and enforce origin enum", () => {
  let state = migrateBoulderState({ status: "active", plan_name: "p" })
  state = addTaskSession(state, "work-1", { sessionId: "ses-1", status: "running", origin: "direct" })
  assert.equal(state.works["work-1"].task_sessions["dsh:ses-1"].sessionId, "dsh:ses-1")
  state = addTaskSession(state, "work-1", { sessionId: "dsh:ses-2", status: "completed", origin: "appended" })
  assert.equal(state.works["work-1"].task_sessions["dsh:ses-2"].origin, "appended")
  assert.throws(() => addTaskSession(state, "work-9", { sessionId: "x", status: "running" }), /unknown work/)
  assert.equal(normalizeSessionId("dsh:abc"), "dsh:abc")
  assert.equal(normalizeSessionId("abc"), "dsh:abc")
})

// --- G8 role mirror (ADR-R16) ---

test("role mirror round-trips and fails closed on corrupt/unsupported input", async () => {
  const { buildRoleMirror, parseRoleMirror, reconcileRoleMirror } = await import("../src/boulder/role-mirror.mjs")
  const mirror = buildRoleMirror({ role: "prometheus", revision: 3, reason: "r", changedAt: "t" })
  const parsed = parseRoleMirror(JSON.stringify(mirror))
  assert.equal(parsed.status, "ok")
  assert.equal(parsed.mirror.role, "prometheus")
  assert.equal(parseRoleMirror("not json").status, "corrupt")
  assert.equal(parseRoleMirror(JSON.stringify({ schemaVersion: 99 })).status, "unsupported-version")
  assert.equal(parseRoleMirror(JSON.stringify({ schemaVersion: 1, role: "", revision: 0 })).status, "invalid")
  assert.equal(parseRoleMirror("").status, "missing")
})

test("reconcileRoleMirror: session log wins; mirror only when the log cannot be restored", async () => {
  const { reconcileRoleMirror } = await import("../src/boulder/role-mirror.mjs")
  const log = { role: "prometheus", revision: 2 }
  const mirror = { role: "prometheus", revision: 1, changedAt: "t", changedBy: "user", reason: "" }
  assert.deepEqual(reconcileRoleMirror({ logRole: log, mirror }), { authority: "session-log", role: log, mirrorStale: true })
  assert.deepEqual(reconcileRoleMirror({ logRole: null, mirror }), { authority: "boulder-mirror", role: { role: "prometheus", revision: 1 }, mirrorStale: false })
  assert.deepEqual(reconcileRoleMirror({ logRole: null, mirror: null }), { authority: "none", role: null, mirrorStale: false })
})
