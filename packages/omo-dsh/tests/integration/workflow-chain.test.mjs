// E15 integration contract: one end-to-end chain over the pure modules —
// planning pipeline → plan IR → Boulder render → /start-work transition →
// Atlas dependency/evidence gates → completion gate → continuation driver.
import test from "node:test"
import assert from "node:assert/strict"
import { createPlanningPipeline } from "../../src/planning/pipeline.mjs"
import { samplePlan, renderPlanMarkdown, applyProgress } from "../../src/planning/plan-ir.mjs"
import { createRoleController } from "../../src/roles/controller.mjs"
import { buildRoleTransition, reconcileBoulderAgent } from "../../src/work/start-work.mjs"
import { evaluateDependencyGate, evaluateCompletionGate } from "../../src/atlas/work-policy.mjs"
import { createVerificationManifest, addCheck, createEvidenceStore, evaluatePlan } from "../../src/verification/evidence.mjs"
import { decideContinuation } from "../../src/continuation/driver.mjs"
import { createBoulderRepository, createMemoryFs } from "../../src/boulder/repository.mjs"

test("full chain: plan → start-work → atlas gates → final verification → continuation latch", async () => {
  // 1. planning: compat trace with approval gate
  const pipeline = createPlanningPipeline({ profile: "opencode-compat", reviewRequired: false })
  pipeline.startInterview("chain test")
  assert.equal(pipeline.metis([]).ok, false) // approval gate holds
  pipeline.approve(); pipeline.scaffold({}); pipeline.metis([])
  const plan = samplePlan()
  pipeline.authorPlan(renderPlanMarkdown(plan))
  const handoff = pipeline.approveHandoff()
  assert.equal(handoff.ok, true)

  // 2. Boulder: atomic persist + digest
  const repo = createBoulderRepository({ fs: createMemoryFs() })
  const boulder = { status: "active", plan_name: plan.planId, agent: "prometheus", revision: 1 }
  const written = await repo.write("boulder.json", boulder)
  assert.equal(written.status, "written")

  // 3. /start-work: same-session atlas transition + stale agent reconciliation
  const controller = createRoleController()
  const transition = buildRoleTransition({ controller, agentId: "ses-a", atlasRegistered: true, planName: plan.planId })
  assert.equal(transition.role, "atlas")
  const reconciled = reconcileBoulderAgent(boulder, transition.role)
  assert.equal(reconciled.agent, "atlas")

  // 4. Atlas dependency gate blocks t2 until t1 completes
  assert.equal(evaluateDependencyGate(plan, 1).ready, false)
  plan.tasks[0].status = "completed"

  // 5. verification: machine evidence for every item
  let manifest = createVerificationManifest(plan)
  manifest = addCheck(manifest, "todo:1", { command: "node --test", expectExit: 0 })
  manifest = addCheck(manifest, "todo:2", { command: "lint", expectExit: 0 })
  manifest = addCheck(manifest, "final-wave:f1", { command: "full-suite", expectExit: 0 })
  const store = createEvidenceStore()
  for (const [key, command] of [["todo:1", "node --test"], ["todo:2", "lint"], ["final-wave:f1", "full-suite"]]) {
    store.record({ key, command, exitCode: 0, planId: plan.planId, planRevision: plan.revision })
  }
  const evaluation = evaluatePlan(manifest, store.records())
  assert.equal(evaluation.done, true)

  // 6. completion gate + progress round-trip
  const markdown = renderPlanMarkdown(applyProgress(plan, renderPlanMarkdown(plan)))
  plan.tasks[1].status = "completed"
  plan.finalVerification[0].status = "completed"
  const gate = evaluateCompletionGate(plan, evaluation.results)
  assert.equal(gate.complete, true)

  // 7. continuation: completed work never re-enters
  const doneTodos = [{ status: "completed" }, { status: "completed" }]
  const first = decideContinuation({ todos: doneTodos })
  assert.equal(first.action, "verifying")
  const latch = decideContinuation({ todos: doneTodos, latch: { allTodosCompletedAt: Date.now() } })
  assert.equal(latch.action, "wait")

  // 8. boulder round-trip survived with the execution role
  const reread = await repo.read("boulder.json")
  assert.equal(reread.state.agent, "prometheus") // storage unchanged; reconciliation applied to the mirror
})
