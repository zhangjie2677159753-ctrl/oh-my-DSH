import test from "node:test"
import assert from "node:assert/strict"
import { parseStartWork, selectPlanContext, buildRoleTransition, reconcileBoulderAgent } from "../src/work/start-work.mjs"
import { evaluateDependencyGate, checkScopeChange, evaluateCompletionGate } from "../src/atlas/work-policy.mjs"
import { createRoleController } from "../src/roles/controller.mjs"
import { samplePlan } from "../src/planning/plan-ir.mjs"

// --- /start-work command ---

test("only a parsed command can start work; natural language is null", () => {
  assert.equal(parseStartWork("请开始工作"), null)
  assert.equal(parseStartWork("start work now"), null)
  const cmd = parseStartWork("/start-work plan-a --worktree=wt1 --make-pr")
  assert.equal(cmd.kind, "command")
  assert.equal(cmd.planName, "plan-a")
  assert.equal(cmd.worktree, "wt1")
  assert.equal(cmd.makePr, true)
  assert.equal(cmd.ship, false)
})

test("quoted plan names and unknown flags", () => {
  const quoted = parseStartWork('/start-work "plan with spaces" --ship')
  assert.equal(quoted.planName, "plan with spaces")
  assert.equal(quoted.ship, true)
  assert.equal(parseStartWork("/start-work --wat").kind, "invalid")
})

test("context selection precedence and ambiguity surfacing", () => {
  assert.deepEqual(selectPlanContext({ explicitName: "a", knownPlans: ["a", "b"] }), { status: "explicit", planName: "a" })
  assert.equal(selectPlanContext({ explicitName: "z", knownPlans: ["a"] }).status, "unknown-plan")
  assert.equal(selectPlanContext({ recentSessionPlans: ["x", "y"], knownPlans: ["x", "y"] }).planName, "y")
  assert.equal(selectPlanContext({ activeBoulder: { planName: "resume-me" } }).planName, "resume-me")
  assert.equal(selectPlanContext({ knownPlans: ["p", "q"] }).status, "needs-choice")
  assert.equal(selectPlanContext({}).status, "no-plan")
})

test("role transition is same-session, atlas-else-sisyphus, flush required", () => {
  const controller = createRoleController()
  const transition = buildRoleTransition({ controller, agentId: "ses-a", atlasRegistered: true, planName: "plan-a" })
  assert.equal(transition.role, "atlas")
  assert.equal(transition.outgoingMessageRole, "atlas")
  assert.equal(transition.flushRequired, true)
  assert.equal(transition.stopContinuationCleared, true)
  assert.equal(controller.get("ses-a").role, "atlas")

  const fallback = buildRoleTransition({ controller, agentId: "ses-b", atlasRegistered: false, planName: "plan-a" })
  assert.equal(fallback.role, "sisyphus")
})

test("stale Boulder agent=prometheus is reconciled with provenance", () => {
  const boulder = { agent: "prometheus", plan_name: "plan-a" }
  const next = reconcileBoulderAgent(boulder, "atlas")
  assert.equal(next.agent, "atlas")
  assert.deepEqual(next.agentReconciled.from, "prometheus")
  const unchanged = reconcileBoulderAgent({ agent: "atlas" }, "atlas")
  assert.equal(unchanged.agentReconciled, undefined)
})

// --- Atlas work policy ---

test("dependency gate blocks tasks with unfinished dependencies", () => {
  const plan = structuredClone(samplePlan())
  const gate = evaluateDependencyGate(plan, 1)
  assert.equal(gate.ready, false)
  assert.deepEqual(gate.missing, ["t1"])
  plan.tasks[0].status = "completed"
  assert.equal(evaluateDependencyGate(plan, 1).ready, true)
})

test("scope change escalates plan contradiction, destructive and new scope", () => {
  const findings = checkScopeChange({
    plan: samplePlan(),
    planDigestAtApproval: "d1",
    currentDigest: "d2",
    request: { destructive: true, scope: "other", newScope: true },
    workStatus: "active",
  })
  assert.equal(findings.escalate, true)
  assert.ok(findings.findings.some((f) => f.kind === "plan-contradiction"))
  assert.ok(findings.findings.some((f) => f.kind === "destructive"))
  assert.ok(findings.findings.some((f) => f.kind === "new-scope"))
  assert.equal(checkScopeChange({ planDigestAtApproval: "d", currentDigest: "d", workStatus: "active" }).escalate, false)
})

test("completion gate requires every todo AND final-wave item passed", () => {
  const plan = structuredClone(samplePlan())
  const partial = evaluateCompletionGate(plan, [
    { key: "todo:1", result: { status: "passed" } },
    { key: "todo:2", result: { status: "passed" } },
  ])
  assert.equal(partial.complete, false)
  assert.ok(partial.missing.some((m) => m.key === "final-wave:f1"))

  plan.tasks[0].status = "completed"
  plan.tasks[1].status = "completed"
  const full = evaluateCompletionGate(plan, [
    { key: "todo:1", result: { status: "passed" } },
    { key: "todo:2", result: { status: "passed" } },
    { key: "final-wave:f1", result: { status: "passed" } },
  ])
  assert.equal(full.complete, true)
  assert.equal(full.phase, "verifying")
})
