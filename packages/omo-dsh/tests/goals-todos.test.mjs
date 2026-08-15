import test from "node:test"
import assert from "node:assert/strict"
import { applyGoalChange, foldGoalEvents, humanResume, initialGoalState, projectNextTaskTodo, reconcileTodoCompletion } from "../src/compat/goals-todos.mjs"

const plan = { id: "p1", tasks: [{ title: "T1", status: "completed" }, { title: "T2", status: "pending" }] }

test("goal CAS: revisions must advance exactly one", () => {
  let state = initialGoalState()
  state = applyGoalChange(state, { goalId: "g1", revision: 1, action: "create" })
  assert.equal(state.revision, 1)
  assert.equal(state.armed, false)
  assert.throws(() => applyGoalChange(state, { goalId: "g1", revision: 1, action: "edit" }), /CAS/)
  assert.throws(() => applyGoalChange(state, { goalId: "g1", revision: 3, action: "edit" }), /CAS/)
  assert.throws(() => applyGoalChange(state, { goalId: "g2", revision: 2, action: "edit" }), /one goal/)
})

test("blocked requires a reason", () => {
  let state = initialGoalState()
  state = applyGoalChange(state, { goalId: "g1", revision: 1, action: "create" })
  assert.throws(() => applyGoalChange(state, { goalId: "g1", revision: 2, action: "blocked" }), /blockedReason/)
  state = applyGoalChange(state, { goalId: "g1", revision: 2, action: "blocked", blockedReason: "missing credential" })
  assert.equal(state.phase, "blocked")
  assert.equal(state.blockedReason, "missing credential")
})

test("replay fold reconstructs phase but stays disarmed", () => {
  const events = [
    { type: "goal/change", data: { goalId: "g1", revision: 1, action: "create" } },
    { type: "goal/change", data: { goalId: "g1", revision: 2, action: "blocked", blockedReason: "x" } },
  ]
  const state = foldGoalEvents(events)
  assert.equal(state.phase, "blocked")
  assert.equal(state.revision, 2)
  assert.equal(state.armed, false)
})

test("only a direct human resume arms; wrong phase refuses", () => {
  let state = foldGoalEvents([
    { type: "goal/change", data: { goalId: "g1", revision: 1, action: "create" } },
    { type: "goal/change", data: { goalId: "g1", revision: 2, action: "paused" } },
  ])
  const armed = humanResume(state)
  assert.equal(armed.armed, true)
  assert.throws(() => humanResume(initialGoalState()), /cannot resume/)
})

test("todo projection shows only the next incomplete top-level task", () => {
  const out = projectNextTaskTodo(plan)
  assert.deepEqual(out.items, [{ content: "T2", status: "pending" }])
  assert.equal(out.changed, true)
  const again = projectNextTaskTodo(plan, out.items)
  assert.equal(again.changed, false)
})

test("todo projection is empty when plan is complete", () => {
  const done = { id: "p1", tasks: [{ title: "T1", status: "completed" }] }
  const out = projectNextTaskTodo(done)
  assert.deepEqual(out.items, [])
})

test("reconcile completion advances Boulder and recomputes todo", () => {
  const { plan: next, todo } = reconcileTodoCompletion(plan, "T2")
  assert.equal(next.tasks[1].status, "completed")
  assert.deepEqual(todo.items, [])
})

test("reconcile with unknown content fails", () => {
  assert.throws(() => reconcileTodoCompletion(plan, "T99"), /no open plan task/)
})
