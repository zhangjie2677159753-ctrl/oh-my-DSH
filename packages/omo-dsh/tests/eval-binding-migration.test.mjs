import test from "node:test"
import assert from "node:assert/strict"
import { runVariantEval } from "../src/prompts/eval-runner.mjs"
import { buildChildRequest } from "../src/children/dsh-binding.mjs"
import { mapOmoConfigToDsh } from "../src/migration/config-mapper.mjs"

// --- E07 eval runner ---

const variant = {
  role: "atlas",
  modelFamily: "deepseek-v4",
  semanticRevision: "s1",
  variantRevision: "v1",
  sections: [
    { key: "omo:delegation-policy", text: "d" },
    { key: "omo:verification-policy", text: "v" },
    { key: "omo:continuation-policy", text: "c" },
  ],
  assertions: [
    { id: "no-claim-without-evidence", check: "completion only after machine evidence" },
    { id: "final-wave", check: "final wave mandatory" },
  ],
}

test("eval runner executes assertions per scenario and scores all-scenarios", async () => {
  const outcome = await runVariantEval({
    variant,
    scenarios: ["single-file-bug", "five-file-feature"],
    checkers: {
      "no-claim-without-evidence": async ({ observation }) => ({ pass: observation.claimedOnly, evidence: observation.note }),
      "final-wave": async ({ observation }) => ({ pass: observation.finalWave, evidence: observation.note }),
    },
    runScenario: async ({ scenario }) => ({ claimedOnly: scenario === "single-file-bug", finalWave: true, note: `ran ${scenario}` }),
  })
  assert.equal(outcome.results.length, 4)
  // no-claim passes only in one of two scenarios → assertion fails overall
  assert.equal(outcome.score.passed, 1)
  assert.equal(outcome.score.release, false) // 0.5 < 0.9
})

test("missing checker fails the assertion, never skips it", async () => {
  const outcome = await runVariantEval({
    variant,
    scenarios: ["one"],
    checkers: {},
    runScenario: async () => ({}),
  })
  assert.ok(outcome.results.every((r) => r.missing === true && r.pass === false))
  assert.equal(outcome.score.release, false)
})

// --- E10 DSH binding ---

test("child request: fail before launch on missing persona capability", () => {
  const out = buildChildRequest({ role: "explore", capabilities: ["outputSchema", "depthLimit", "toolFilter"], parentSessionId: "p1" })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("persona")))
})

test("child request: full provider binds identical visibility/execution lists", () => {
  const out = buildChildRequest({
    role: "metis", profile: "senpi-compat", capabilities: ["persona", "toolFilter", "depthLimit"],
    parentSessionId: "p1", maxDepth: 0,
  })
  assert.equal(out.ok, true, out.errors.join(";"))
  assert.equal(out.request.kind, "one-shot")
  assert.equal(out.request.persona, "omo-child:metis")
  assert.ok(out.request.toolFilter.deny.includes("task_send"))
  assert.ok(out.request.toolFilter.deny.includes("write"))
})

test("continuable child rejects outputSchema before launch", () => {
  const out = buildChildRequest({
    role: "oracle", mode: "continuable", capabilities: ["persona", "toolFilter", "outputSchema"],
    parentSessionId: "p1", outputSchema: { type: "object" },
  })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("outputSchema")))
})

test("unknown role reports without throwing", () => {
  const out = buildChildRequest({ role: "ghost", parentSessionId: "p1" })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("unknown")))
})

// --- E29 migration dry-run ---

test("mapper reports unmapped keys and keeps secrets as credential references", () => {
  const out = mapOmoConfigToDsh({
    team_mode: { enabled: true },
    telemetry: false,
    unknown_feature: true,
    api_key: "sk-abcdefghijklmnop123456",
  })
  assert.equal(out.ok, true, out.errors.join(";"))
  assert.equal(out.config.integrations.team, true)
  assert.equal(out.config.telemetry.enabled, false)
  assert.ok(out.unmapped.some((u) => u.key === "unknown_feature"))
  assert.ok(out.warnings.some((w) => w.includes("api_key")))
  assert.equal(out.config.credentials["omo-api_key"], "credential:omo-api_key")
})

test("mapper is digest-stable (idempotent reruns)", () => {
  const input = { team_mode: { enabled: true }, openclaw: { enabled: true } }
  assert.equal(mapOmoConfigToDsh(input).digest, mapOmoConfigToDsh(input).digest)
  assert.equal(mapOmoConfigToDsh(input).config.integrations.openclaw, true)
})

test("non-object input fails cleanly", () => {
  assert.equal(mapOmoConfigToDsh(null).ok, false)
})
