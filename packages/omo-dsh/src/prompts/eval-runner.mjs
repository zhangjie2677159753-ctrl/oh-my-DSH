// omo-dsh prompt variant eval runner (E07 execution half), pure part.
// A variant ships semantic-contract assertions; this runner executes them
// against an injectable scenario executor and feeds scoreVariant(). The
// checker map is deployment-owned (human/keyless checks), never the model
// grading itself.
import { scoreVariant, validateVariantManifest } from "./eval-plan.mjs"

export async function runVariantEval({ variant, scenarios, checkers, runScenario }) {
  const errors = validateVariantManifest(variant)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  if (typeof runScenario !== "function") throw new TypeError("runScenario: required function")
  if (scenarios.length === 0) throw new TypeError("scenarios: non-empty corpus required")

  const results = []
  for (const scenario of scenarios) {
    const observation = await runScenario({ scenario, variant })
    for (const assertion of variant.assertions) {
      const checker = checkers?.[assertion.id]
      if (typeof checker !== "function") {
        results.push({ id: assertion.id, pass: false, evidence: null, missing: true, scenario, reason: `no checker for ${assertion.id}` })
        continue
      }
      const verdict = await checker({ scenario, observation })
      results.push({
        id: assertion.id,
        pass: verdict?.pass === true,
        evidence: verdict?.evidence ?? null,
        missing: false,
        scenario,
        reason: verdict?.pass === true ? undefined : (verdict?.reason ?? "checker failed"),
      })
    }
  }
  // aggregate per assertion across scenarios: an assertion passes only when
  // EVERY scenario observation satisfies it
  const byAssertion = new Map()
  for (const result of results) {
    const aggregate = byAssertion.get(result.id) ?? { id: result.id, pass: true, evidence: [] }
    aggregate.pass = aggregate.pass && result.pass
    aggregate.evidence.push(result.evidence)
    byAssertion.set(result.id, aggregate)
  }
  const score = scoreVariant(variant, [...byAssertion.values()].map((a) => ({ id: a.id, pass: a.pass, evidence: a.evidence })))
  return { results, score }
}
