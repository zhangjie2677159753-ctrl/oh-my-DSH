// omo-dsh prompt variant eval skeleton (E07), pure part.
// Every per-model prompt variant must declare semantic-contract assertions for
// the mandatory policy sections; the eval manifest pins scenarios, thresholds
// and the release decision. A variant without assertions can never release.
import { sha256 } from "../compat/prompt.mjs"

export const MANDATORY_ASSERTION_SECTIONS = Object.freeze([
  "omo:delegation-policy",
  "omo:verification-policy",
  "omo:continuation-policy",
])

export function validateVariantManifest(variant) {
  const errors = []
  if (variant === null || typeof variant !== "object" || Array.isArray(variant)) return ["variant: expected object"]
  for (const field of ["role", "modelFamily", "semanticRevision", "variantRevision"]) {
    if (typeof variant[field] !== "string" || variant[field].length === 0) errors.push(`variant.${field}: required`)
  }
  if (!Array.isArray(variant.sections)) {
    errors.push("variant.sections: expected array")
    return errors
  }
  const keys = new Set(variant.sections.map((s) => s?.key))
  for (const required of MANDATORY_ASSERTION_SECTIONS) {
    if (!keys.has(required)) errors.push(`variant.sections: mandatory ${required} missing`)
  }
  if (!Array.isArray(variant.assertions) || variant.assertions.length === 0) {
    errors.push("variant.assertions: required non-empty array (a variant without semantic-contract assertions can never release)")
  }
  for (const assertion of variant.assertions ?? []) {
    if (typeof assertion.id !== "string" || assertion.id.length === 0) errors.push("assertion.id: required")
    if (typeof assertion.check !== "string" || assertion.check.length === 0) errors.push(`assertion ${assertion.id}.check: required`)
  }
  return errors
}

export function scoreVariant(variant, results) {
  const errors = validateVariantManifest(variant)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  const byId = new Map(results.map((r) => [r.id, r]))
  const evaluated = variant.assertions.map((assertion) => {
    const result = byId.get(assertion.id)
    return {
      id: assertion.id,
      pass: result?.pass === true,
      evidence: result?.evidence ?? null,
      missing: result === undefined,
    }
  })
  const passed = evaluated.filter((e) => e.pass).length
  const total = evaluated.length
  const score = total === 0 ? 0 : passed / total
  return {
    role: variant.role,
    modelFamily: variant.modelFamily,
    passed,
    total,
    score,
    threshold: 0.9,
    release: score >= 0.9,
    evaluated,
    digest: sha256(JSON.stringify({ variant, results })),
  }
}

export function buildEvalManifest({ variants, scenarios = [], threshold = 0.9 }) {
  const errors = []
  for (const variant of variants) errors.push(...validateVariantManifest(variant))
  if (scenarios.length === 0) errors.push("scenarios: required non-empty array (no eval corpus)")
  if (typeof threshold !== "number" || threshold < 0.5 || threshold > 1) errors.push("threshold: expected 0.5..1")
  return {
    ok: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? Object.freeze({
      variants: variants.map((v) => Object.freeze({ role: v.role, modelFamily: v.modelFamily, assertions: v.assertions.length })),
      scenarios: Object.freeze([...scenarios]),
      threshold,
    }) : null,
  }
}
