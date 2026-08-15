import test from "node:test"
import assert from "node:assert/strict"
import { runToolPipeline, checkpoint, CooperativeCancelled, validateToolPolicy, resolveToolDecision } from "../src/compat/tools.mjs"

test("plain execution passes pre → execute → post", () => {
  const log = []
  const outcome = runToolPipeline({
    name: "read",
    args: { path: "a" },
    preHooks: [({ args }) => log.push(`pre:${args.path}`)],
    execute: ({ args }) => { log.push(`exec:${args.path}`); return "content" },
    postHooks: [({ result }) => log.push(`post:${result}`)],
  })
  assert.equal(outcome.status, "ok")
  assert.equal(outcome.result, "content")
  assert.deepEqual(log, ["pre:a", "exec:a", "post:content"])
})

test("pre-hook deny blocks execute; later allow cannot resurrect (monotonic)", () => {
  let executed = false
  const outcome = runToolPipeline({
    name: "write",
    args: {},
    preHooks: [
      ({ name }) => ({ deny: `role forbids ${name}` }),
      () => ({ allow: true }),
    ],
    execute: () => { executed = true; return "written" },
  })
  assert.equal(outcome.status, "denied")
  assert.equal(executed, false)
  assert.ok(outcome.reason.includes("forbids"))
})

test("guard deny blocks execute", () => {
  let executed = false
  const outcome = runToolPipeline({
    name: "task",
    args: {},
    guard: () => ({ deny: "not allowed in this role" }),
    execute: () => { executed = true; return "spawned" },
  })
  assert.equal(outcome.status, "denied")
  assert.equal(executed, false)
})

test("post hook replace / enhance / block", () => {
  const replaced = runToolPipeline({ name: "x", args: {}, execute: () => "raw", postHooks: [() => ({ action: "replace", result: "clean" })] })
  assert.equal(replaced.result, "clean")
  const enhanced = runToolPipeline({ name: "x", args: {}, execute: () => "raw", postHooks: [() => ({ action: "enhance", addendum: "checked" })] })
  assert.equal(enhanced.result, "raw\nchecked")
  const blocked = runToolPipeline({ name: "x", args: {}, execute: () => "raw", postHooks: [() => ({ action: "block", reason: "policy" })] })
  assert.equal(blocked.status, "blocked")
})

test("cooperative cancellation at checkpoint never claims success", () => {
  let sideEffect = false
  const outcome = runToolPipeline({
    name: "deploy",
    args: {},
    cancelToken: { cancelled: false },
    execute: () => { sideEffect = true; return "deployed" },
  })
  assert.equal(outcome.status, "ok")

  const cancelled = runToolPipeline({
    name: "deploy",
    args: {},
    cancelToken: { cancelled: true, reason: "user stop" },
    execute: () => { sideEffect = true; return "deployed" },
  })
  assert.equal(cancelled.status, "cancelled")
  assert.equal(cancelled.sideEffectsPossible, undefined)
})

test("checkpoint throws only when cancelled", () => {
  assert.throws(() => checkpoint({ cancelled: true }), CooperativeCancelled)
  assert.doesNotThrow(() => checkpoint({ cancelled: false }))
  assert.doesNotThrow(() => checkpoint(undefined))
})

test("policy startup validation fails on unknown tool names", () => {
  const errors = validateToolPolicy(["read", "write"], { roles: ["atlas"], rules: [{ allow: ["read"], deny: ["deploy"] }] })
  assert.ok(errors.some((e) => e.includes("deploy")))
  assert.deepEqual(validateToolPolicy(["read", "write"], { roles: ["atlas"], rules: [{ allow: ["read"], deny: ["write"] }] }), [])
})

test("role decision: deny outranks allow, escalation advisory", () => {
  const policy = {
    default: "deny",
    rules: [
      { roles: ["atlas"], allow: ["task", "read"] },
      { roles: ["atlas"], deny: ["task"], escalate: "orchestration-only" },
      { roles: ["prometheus"], allow: ["read"] },
    ],
  }
  assert.equal(resolveToolDecision(policy, "atlas", "read").decision, "allow")
  const task = resolveToolDecision(policy, "atlas", "task")
  assert.equal(task.decision, "deny")
  assert.equal(task.escalate, "orchestration-only")
  assert.equal(resolveToolDecision(policy, "prometheus", "task").decision, "deny")
})
