import test from "node:test"
import assert from "node:assert/strict"
import { normalizeTaskArgs, resolveTaskTarget, parseTaskResultFooter, buildCanonicalDescriptor } from "../src/tasks/task.mjs"

const base = { description: "do the thing", prompt: "implement X", category: "quick" }

test("category only → junior via category", () => {
  const out = normalizeTaskArgs(base)
  assert.equal(out.ok, true, out.errors.join(";"))
  assert.equal(out.normalized.target.role, "sisyphus-junior")
  assert.equal(out.normalized.target.via, "category")
  assert.equal(out.normalized.runInBackground, false)
  assert.deepEqual(out.normalized.skills, [])
})

test("subagent_type only → named child role", () => {
  const out = normalizeTaskArgs({ ...base, category: undefined, subagent_type: "explore" })
  assert.equal(out.ok, true)
  assert.equal(out.normalized.target.role, "explore")
})

test("both supplied: category wins with deprecation warning (compat, not hard rejection)", () => {
  const out = normalizeTaskArgs({ ...base, subagent_type: "oracle" })
  assert.equal(out.ok, true)
  assert.equal(out.normalized.target.role, "sisyphus-junior")
  assert.equal(out.normalized.subagentType, null)
  assert.ok(out.warnings.some((w) => w.includes("category wins")))
})

test("direct junior target rejected with category hint", () => {
  const out = normalizeTaskArgs({ ...base, category: undefined, subagent_type: "sisyphus-junior" })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("selected by category")))
})

test("primary coordinator target rejected", () => {
  for (const role of ["sisyphus", "hephaestus", "prometheus", "atlas"]) {
    const out = normalizeTaskArgs({ ...base, category: undefined, subagent_type: role })
    assert.equal(out.ok, false, role)
    assert.ok(out.errors.some((e) => e.includes("primary coordinators")))
  }
})

test("neither target → error", () => {
  const out = normalizeTaskArgs({ ...base, category: undefined })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("one of category")))
})

test("background default false; explicit true respected", () => {
  assert.equal(normalizeTaskArgs(base).normalized.runInBackground, false)
  assert.equal(normalizeTaskArgs({ ...base, run_in_background: true }).normalized.runInBackground, true)
  assert.equal(normalizeTaskArgs({ ...base, run_in_background: "yes" }).ok, false)
})

test("skills default [] and explicit null rejected", () => {
  assert.deepEqual(normalizeTaskArgs(base).normalized.skills, [])
  assert.deepEqual(normalizeTaskArgs({ ...base, load_skills: ["ulw-plan"] }).normalized.skills, ["ulw-plan"])
  const bad = normalizeTaskArgs({ ...base, load_skills: null })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((e) => e.includes("explicit null")))
})

test("description/prompt required and trimmed", () => {
  assert.equal(normalizeTaskArgs({ ...base, description: "  " }).ok, false)
  assert.equal(normalizeTaskArgs({ ...base, prompt: "" }).ok, false)
  assert.equal(normalizeTaskArgs({ ...base, description: " x " }).normalized.description, "x")
})

test("unknown child subagent_type fails before any model fetch", () => {
  const out = resolveTaskTarget({ subagent_type: "teleporter" })
  assert.equal(out.status, "error")
})

test("result footer parses the fixed task_send continuation contract", () => {
  const text = 'done\n[task_id: abc123 - continue with task_send(to="abc123", message="please continue")]\n'
  const footer = parseTaskResultFooter(text)
  assert.deepEqual(footer, { taskId: "abc123", to: "abc123", message: "please continue" })
  assert.equal(parseTaskResultFooter("no footer here"), null)
})

test("canonical descriptor marks foreground vs job kind", () => {
  const norm = normalizeTaskArgs(base).normalized
  const d1 = buildCanonicalDescriptor({ normalized: norm, invocationId: "i1", parentSessionId: "p1", route: { aliasId: "primary.deep" } })
  assert.equal(d1.kind, "foreground")
  const d2 = buildCanonicalDescriptor({ normalized: normalizeTaskArgs({ ...base, run_in_background: true }).normalized, invocationId: "i2", parentSessionId: "p1" })
  assert.equal(d2.kind, "job")
  assert.ok(Object.isFrozen(d1))
})
