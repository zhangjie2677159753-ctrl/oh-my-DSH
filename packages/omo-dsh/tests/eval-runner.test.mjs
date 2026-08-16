import { test } from "node:test"
import assert from "node:assert/strict"
import { runVariantEval } from "../src/prompts/eval-runner.mjs"

const variant = {
  role: "sisyphus",
  modelFamily: "deepseek-v4",
  semanticRevision: "v1",
  variantRevision: "v1",
  sections: [
    { key: "omo:delegation-policy", text: "d" },
    { key: "omo:verification-policy", text: "v" },
    { key: "omo:continuation-policy", text: "c" },
  ],
  assertions: [
    { id: "role-faithful", check: "deployment-owned checker" },
    { id: "no-fabrication", check: "deployment-owned checker" },
  ],
}

function runScenario(observations) {
  return async () => observations.shift()
}

test("runVariantEval rejects malformed variants before any execution", async () => {
  await assert.rejects(
    runVariantEval({ variant: { name: "" }, scenarios: ["s"], checkers: {}, runScenario: async () => ({}) }),
    /required/,
  )
  await assert.rejects(
    runVariantEval({ variant, scenarios: [], checkers: {}, runScenario: async () => ({}) }),
    /non-empty corpus/,
  )
  await assert.rejects(
    runVariantEval({ variant, scenarios: ["s"], checkers: {}, runScenario: null }),
    /runScenario: required function/,
  )
})

test("missing checker fails the assertion with missing flag (never silently passes)", async () => {
  const { results } = await runVariantEval({
    variant,
    scenarios: ["s1"],
    checkers: {},
    runScenario: async () => ({ ok: true }),
  })
  assert.equal(results.length, 2)
  for (const r of results) {
    assert.equal(r.pass, false)
    assert.equal(r.missing, true)
  }
})

test("assertion aggregates across scenarios: every scenario must pass", async () => {
  const observations = [
    { role: "sisyphus" },
    { role: "prometheus" }, // role faithfulness fails on this one
  ]
  const { results, score } = await runVariantEval({
    variant,
    scenarios: ["s1", "s2"],
    checkers: {
      "role-faithful": async ({ observation }) => ({ pass: observation.role === "sisyphus", evidence: observation.role }),
      "no-fabrication": async () => ({ pass: true, evidence: "clean" }),
    },
    runScenario: runScenario(observations),
  })
  const roleFaithful = results.filter((r) => r.id === "role-faithful")
  assert.equal(roleFaithful.length, 2)
  assert.equal(roleFaithful[0].pass, true)
  assert.equal(roleFaithful[1].pass, false)
  assert.equal(roleFaithful[1].evidence, "prometheus")
  // scoreVariant returns { passed: count, evaluated: [{id, pass}] }
  assert.equal(score.evaluated.find((a) => a.id === "role-faithful").pass, false)
  assert.equal(score.evaluated.find((a) => a.id === "no-fabrication").pass, true)
  assert.equal(score.passed, 1)
})

test("checker throwing is contained as a per-result failure with reason", async () => {
  const { results } = await runVariantEval({
    variant,
    scenarios: ["s1"],
    checkers: {
      "role-faithful": async () => { throw new Error("checker boom") },
      "no-fabrication": async () => ({ pass: true }),
    },
    runScenario: async () => ({}),
  })
  const boom = results.find((r) => r.id === "role-faithful")
  assert.equal(boom.pass, false)
  assert.ok(String(boom.reason).includes("boom"))
})
