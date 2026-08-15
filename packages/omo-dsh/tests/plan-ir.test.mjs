import test from "node:test"
import assert from "node:assert/strict"
import { validateOmoPlanV1, renderPlanMarkdown, applyProgress, planDigest, samplePlan } from "../src/planning/plan-ir.mjs"
import { parsePlanChecklist } from "../src/boulder/plan-checklist.mjs"

test("sample plan validates", () => {
  assert.deepEqual(validateOmoPlanV1(samplePlan()), [])
})

test("duplicate ids, unknown deps, self-deps, cycles and missing acceptance fail", () => {
  const base = samplePlan()
  const dup = structuredClone(base)
  dup.tasks[1].id = "t1"
  assert.ok(validateOmoPlanV1(dup).some((e) => e.includes("duplicate")))

  const unknown = structuredClone(base)
  unknown.tasks[1].dependencies = ["ghost"]
  assert.ok(validateOmoPlanV1(unknown).some((e) => e.includes("unknown ghost")))

  const self = structuredClone(base)
  self.tasks[0].dependencies = ["t1"]
  assert.ok(validateOmoPlanV1(self).some((e) => e.includes("self-dependency")))

  const cycle = structuredClone(base)
  cycle.tasks[0].dependencies = ["t2"]
  assert.ok(validateOmoPlanV1(cycle).some((e) => e.includes("cycle")))

  const noAcceptance = structuredClone(base)
  noAcceptance.tasks[0].acceptance = []
  assert.ok(validateOmoPlanV1(noAcceptance).some((e) => e.includes("acceptance")))
})

test("final verification wave is mandatory", () => {
  const missing = structuredClone(samplePlan())
  missing.finalVerification = []
  assert.ok(validateOmoPlanV1(missing).some((e) => e.includes("mandatory")))
})

test("renderer emits exact Boulder grammar and round-trips through the parser", () => {
  const markdown = renderPlanMarkdown(samplePlan())
  assert.ok(markdown.startsWith("## TODOs\n- [ ] 1. First task\n"))
  assert.ok(markdown.includes("## Final Verification Wave\n- [ ] F1. Run full suite\n"))
  const checklist = parsePlanChecklist(markdown)
  assert.equal(checklist.todos.length, 2)
  assert.equal(checklist.finalWave.length, 1)
  assert.equal(checklist.next.key, "todo:1")
})

test("applyProgress maps checkbox states back onto the IR", () => {
  const markdown = renderPlanMarkdown(samplePlan())
  const progressed = "## TODOs\n- [x] 1. First task\n- [ ] 2. Second task\n## Final Verification Wave\n- [ ] F1. Run full suite\n"
  const next = applyProgress(samplePlan(), progressed)
  assert.equal(next.tasks[0].status, "completed")
  assert.equal(next.tasks[1].status, "pending")
  assert.equal(next.finalVerification[0].status, "pending")
})

test("plan digest is stable for equal content", () => {
  assert.equal(planDigest(samplePlan()), planDigest(samplePlan()))
  const changed = structuredClone(samplePlan())
  changed.revision = 2
  assert.notEqual(planDigest(changed), planDigest(samplePlan()))
})
