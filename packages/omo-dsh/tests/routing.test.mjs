import test from "node:test"
import assert from "node:assert/strict"
import { classifyRequestError, createFallbackMachine } from "../src/compat/routing.mjs"

test("classify: rate-limit and transient are retryable and cross-provider", () => {
  assert.equal(classifyRequestError({ code: "rate_limit" }).class, "rate-limit")
  assert.equal(classifyRequestError(new Error("429 too many requests")).retryable, true)
  assert.equal(classifyRequestError(new Error("connection reset")).class, "transient")
  assert.equal(classifyRequestError(new Error("timeout")).crossProvider, true)
})

test("classify: auth/context/schema/policy/capability/refusal are terminal", () => {
  for (const err of [
    new Error("401 unauthorized"),
    new Error("maximum context length exceeded"),
    new Error("Invalid schema for function 'x'"),
    new Error("content filter policy rejected"),
    new Error("model does not support vision"),
    new Error("I cannot help with that"),
  ]) {
    const c = classifyRequestError(err)
    assert.equal(c.retryable, false, err.message)
  }
  assert.equal(classifyRequestError(new Error("authentication failed")).crossProvider, false)
})

test("successful attempt binds route and prompt family", async () => {
  const machine = createFallbackMachine({
    routes: [
      { id: "r1", capabilities: ["text", "tools"], promptFamily: "deepseek-v4" },
      { id: "r2", capabilities: ["text", "tools"], promptFamily: "gpt" },
    ],
  })
  const outcome = await machine.attempt("s1", (routeId) => `answer-from-${routeId}`)
  assert.equal(outcome.status, "ok")
  assert.equal(outcome.routeId, "r1")
  assert.equal(outcome.promptFamily, "deepseek-v4")
  assert.equal(machine.state().promptFamilyBinding, "deepseek-v4")
})

test("transient failure falls through the chain and exhausts bounded", async () => {
  const machine = createFallbackMachine({
    routes: [
      { id: "r1", capabilities: ["text"], promptFamily: "deepseek-v4" },
      { id: "r2", capabilities: ["text"], promptFamily: "gpt" },
    ],
    maxAttemptsPerRoute: 1,
  })
  const outcome = await machine.attempt("s1", () => {
    throw new Error("timeout")
  })
  assert.equal(outcome.status, "exhausted")
  assert.equal(machine.state().log.filter((e) => e.event === "error").length, 2)
})

test("auth failure is terminal and never crosses providers", async () => {
  let r2Calls = 0
  const machine = createFallbackMachine({
    routes: [
      { id: "r1", capabilities: ["text"], promptFamily: "deepseek-v4" },
      { id: "r2", capabilities: ["text"], promptFamily: "gpt" },
    ],
  })
  const outcome = await machine.attempt("s1", (routeId) => {
    if (routeId === "r2") r2Calls++
    throw new Error("401 unauthorized")
  })
  assert.equal(outcome.status, "terminal")
  assert.equal(outcome.reason, "auth")
  assert.equal(r2Calls, 0)
})

test("capability mismatch skips route instead of silent degradation", async () => {
  const machine = createFallbackMachine({
    routes: [
      { id: "text-only", capabilities: ["text"], promptFamily: "deepseek-v4" },
      { id: "vision", capabilities: ["text", "vision"], promptFamily: "gpt" },
    ],
    requiredCapabilities: ["vision"],
  })
  const outcome = await machine.attempt("s1", (routeId) => `ok-${routeId}`)
  assert.equal(outcome.routeId, "vision")
  assert.ok(machine.state().log.some((e) => e.event === "capability-skip" && e.route === "text-only"))
})

test("max attempts per route bounds retries; exhausted when all routes drained", async () => {
  const machine = createFallbackMachine({
    routes: [{ id: "r1", capabilities: ["text"], promptFamily: "deepseek-v4" }],
    maxAttemptsPerRoute: 2,
  })
  const a = await machine.attempt("s1", () => { throw new Error("503") })
  assert.equal(a.status, "exhausted")
  assert.equal(machine.state().attempts.r1, 1)
  const b = await machine.attempt("s2", () => { throw new Error("503") })
  assert.equal(b.status, "exhausted")
  assert.equal(machine.state().attempts.r1, 2)
  const c = await machine.attempt("s3", () => "late")
  assert.equal(c.status, "exhausted")
})

test("open circuit blocks the route", async () => {
  const machine = createFallbackMachine({
    routes: [{ id: "r1", capabilities: ["text"], promptFamily: "deepseek-v4" }],
  })
  machine.openCircuit("r1")
  const outcome = await machine.attempt("s1", () => "never")
  assert.equal(outcome.status, "exhausted")
  assert.deepEqual(machine.state().circuits, ["r1"])
})

test("fallback machine holds no tool state — inference retry never replays tools", () => {
  // Structural guarantee: the machine API only exposes inference attempts.
  const machine = createFallbackMachine({ routes: [{ id: "r1", capabilities: ["text"], promptFamily: "g" }] })
  const state = machine.state()
  assert.ok(!("tools" in state))
  assert.ok(!("sideEffects" in state))
})
