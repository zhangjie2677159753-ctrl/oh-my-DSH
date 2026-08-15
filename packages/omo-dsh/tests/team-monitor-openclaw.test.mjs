import test from "node:test"
import assert from "node:assert/strict"
import { createTeamRun, validateTeamRoster, createWorktreeLeases } from "../src/team/policy.mjs"
import { createMonitorRegistry } from "../src/monitor/policy.mjs"
import { createOpenClawPolicy, redact } from "../src/openclaw/policy.mjs"

// --- E24 team ---

const five = ["skeptic", "validator", "researcher", "architect", "creative"].map((name) => ({ name }))
const four = five.filter((m) => m.name !== "researcher")

test("hyperplan roster: 5 normal, 4 degraded without researcher", () => {
  assert.deepEqual(validateTeamRoster({ workflow: "hyperplan", members: five }), [])
  assert.deepEqual(validateTeamRoster({ workflow: "hyperplan", members: four }), [])
  assert.ok(validateTeamRoster({ workflow: "hyperplan", members: five.slice(0, 3) }).some((e) => e.includes("requires")))
  const fourWithResearcher = five.filter((m) => m.name !== "architect") // 4 members, keeps researcher
  assert.ok(validateTeamRoster({ workflow: "hyperplan", members: fourWithResearcher }).some((e) => e.includes("drop researcher")))
})

test("security-research never falls below five", () => {
  const securityMembers = ["surface-hunter", "auth-data-hunter", "runtime-supply-hunter", "poc-a", "poc-b"].map((name) => ({ name }))
  assert.deepEqual(validateTeamRoster({ workflow: "security-research", members: securityMembers }), [])
  assert.ok(validateTeamRoster({ workflow: "security-research", members: securityMembers.slice(0, 4) }).some((e) => e.includes("never fall below 5")))
})

test("mailbox: roster-only senders/recipients; plan agent is NOT a member", () => {
  const run = createTeamRun({ workflow: "hyperplan", members: five })
  assert.equal(run.send({ from: "skeptic", to: "validator", content: "attack" }).delivered, true)
  assert.equal(run.inbox("validator").length, 1)
  assert.throws(() => run.send({ from: "outsider", to: "validator", content: "x" }), /not in roster/)
  assert.throws(() => run.send({ from: "skeptic", to: "plan", content: "handoff" }), /not in roster/)
})

test("shutdown drains the actual roster and reports no orphans", () => {
  const run = createTeamRun({ workflow: "hyperplan", members: four })
  run.send({ from: "skeptic", to: "validator", content: "x" })
  const shutdown = run.shutdown()
  assert.equal(shutdown.drained, 4)
  assert.equal(shutdown.orphans, 0)
  assert.equal(run.inbox("validator").length, 0)
})

test("worktree leases: single writer per worktree", () => {
  const leases = createWorktreeLeases()
  assert.equal(leases.acquire("wt1", "w1").granted, true)
  const second = leases.acquire("wt1", "w2")
  assert.equal(second.granted, false)
  assert.equal(second.holder, "w1")
  assert.throws(() => leases.release("wt1", "w2"), /held by/)
  assert.equal(leases.release("wt1", "w1").released, true)
})

// --- E26 monitor ---

test("monitor lifecycle and duplicate intervention lease", () => {
  const registry = createMonitorRegistry()
  registry.start({ id: "m1", sessionId: "s1" })
  registry.start({ id: "m2", sessionId: "s1" })
  assert.equal(registry.list().length, 2)
  assert.equal(registry.claimIntervention({ target: "t1", monitorId: "m1" }).granted, true)
  const dup = registry.claimIntervention({ target: "t1", monitorId: "m2" })
  assert.equal(dup.granted, false)
  assert.equal(dup.reason, "duplicate intervention lease")
  assert.throws(() => registry.claimIntervention({ target: "t2", monitorId: "ghost" }), /not running/)
  assert.equal(registry.stop("m1").stopped, "m1")
})

test("observers have no completion authority by construction", () => {
  const registry = createMonitorRegistry()
  // The registry API surface contains only lifecycle + lease methods.
  for (const key of Object.keys(registry)) {
    assert.ok(!/complete|approve|setStatus|authority/i.test(key), `unexpected authority method ${key}`)
  }
})

test("session cleanup removes all bound monitors", () => {
  const registry = createMonitorRegistry()
  registry.start({ id: "m1", sessionId: "s1" })
  registry.start({ id: "m2", sessionId: "s2" })
  const cleanup = registry.cleanupSession("s1")
  assert.deepEqual(cleanup.removed, ["m1"])
  assert.equal(registry.list().length, 1)
})

// --- E25 OpenClaw ---

test("disabled by default; non-read requires idempotency key", () => {
  const policy = createOpenClawPolicy()
  assert.equal(policy.check({}).allowed, false)
  const enabled = createOpenClawPolicy({ enabled: true })
  assert.equal(enabled.check({ method: "POST", payload: {} }).allowed, false)
  assert.equal(enabled.check({ method: "POST", idempotencyKey: "k1", payload: {} }).allowed, true)
  assert.equal(enabled.check({ method: "GET" }).allowed, true)
})

test("outbound and inbound payloads are redacted", () => {
  const policy = createOpenClawPolicy({ enabled: true })
  const check = policy.check({ method: "GET", payload: { token: "sk-abcdefghijklmnop123456" } })
  assert.ok(check.outbound.includes("[REDACTED]"))
  const outcome = policy.recordOutcome({ ok: true, inbound: { reply: "Bearer abcdef12345678_xx" } })
  assert.ok(outcome.inboundRedacted.includes("[REDACTED]"))
})

test("circuit opens after maxRetries and enters degraded mode", () => {
  const policy = createOpenClawPolicy({ enabled: true, maxRetries: 3 })
  policy.recordOutcome({ ok: false })
  policy.recordOutcome({ ok: false })
  const third = policy.recordOutcome({ ok: false })
  assert.equal(third.degraded, true)
  assert.equal(policy.check({ method: "GET" }).allowed, false)
  const reset = policy.resetCircuit()
  assert.equal(reset.degraded, false)
  assert.equal(policy.check({ method: "GET" }).allowed, true)
})

test("core completion never depends on the gateway (structural)", () => {
  // Degraded gateway state is isolated: reset restores, and the module has no
  // connection to verification/completion authority modules.
  const policy = createOpenClawPolicy({ enabled: true, maxRetries: 1 })
  policy.recordOutcome({ ok: false })
  assert.equal(policy.state().circuitOpen, true)
  assert.deepEqual(Object.keys(policy).sort(), ["check", "recordOutcome", "resetCircuit", "state"])
})
