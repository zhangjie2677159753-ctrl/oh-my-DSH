// omo-dsh prompt/inbox adapter, pure part (OMO-0202).
// Ordered prompt-section assembly and the atomic role boundary capture.
// Mirrors the DSH contract: sections are fiber-scoped with order + shadowing;
// `installModelSelection()` captures the model route at assembly time so a
// concurrent role change cannot tear prompt/model apart. Our pure part models
// the same rule: one frozen role revision per assembly.
import { createHash } from "node:crypto"

export const SECTION_ORDER = Object.freeze({
  "omo:identity": 10,
  "omo:role": 20,
  "omo:operating-principles": 30,
  "omo:planning-policy": 40,
  "omo:delegation-policy": 50,
  "omo:verification-policy": 60,
  "omo:continuation-policy": 70,
  "omo:catalog": 80,
  "omo:boulder-context": 90,
  "omo:project-context": 100,
})

const MANDATORY_POLICY_SECTIONS = Object.freeze([
  "omo:delegation-policy",
  "omo:verification-policy",
  "omo:continuation-policy",
])

export function validatePromptManifest(manifest) {
  const errors = []
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return ["manifest: expected object"]
  if (typeof manifest.role !== "string") errors.push("manifest.role: expected string")
  if (typeof manifest.modelFamily !== "string") errors.push("manifest.modelFamily: expected string")
  if (!Array.isArray(manifest.sections)) {
    errors.push("manifest.sections: expected array")
    return errors
  }
  const seen = new Set()
  for (const section of manifest.sections) {
    if (typeof section?.key !== "string" || !(section.key in SECTION_ORDER)) {
      errors.push(`manifest.sections: unknown section key ${JSON.stringify(section?.key)}`)
      continue
    }
    if (seen.has(section.key)) errors.push(`manifest.sections: duplicate key ${section.key}`)
    seen.add(section.key)
    if (typeof section.text !== "string") errors.push(`manifest.sections.${section.key}: text must be string`)
  }
  for (const required of MANDATORY_POLICY_SECTIONS) {
    if (!seen.has(required)) errors.push(`manifest.sections: mandatory section ${required} missing`)
  }
  return errors
}

/**
 * Assemble the ordered prompt text for one frozen (role, modelFamily, revision)
 * snapshot. Sections not active for this role/manifest resolve to "" but keep
 * their slot; mandatory policy sections can never be removed by an override.
 */
export function assemblePrompt(manifest, { role, modelFamily, revision, boulderContext = null, overrides = {} }) {
  const errors = validatePromptManifest(manifest)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  for (const key of Object.keys(overrides)) {
    if (!(key in SECTION_ORDER)) throw new TypeError(`override key ${key}: unknown section`)
    if (MANDATORY_POLICY_SECTIONS.includes(key) && overrides[key] === "") {
      throw new TypeError(`override key ${key}: mandatory policy section cannot be emptied`)
    }
  }
  const lines = []
  const sectionHashes = {}
  const byKey = new Map(manifest.sections.map((s) => [s.key, s]))
  for (const key of Object.keys(SECTION_ORDER).sort((a, b) => SECTION_ORDER[a] - SECTION_ORDER[b])) {
    const active = role === manifest.role && modelFamily === manifest.modelFamily
    const section = byKey.get(key)
    const text = active && section ? (overrides[key] ?? section.text) : ""
    if (text) lines.push(`[${key}]`, text)
    sectionHashes[key] = text ? sha256(text) : ""
  }
  if (boulderContext !== null) {
    const text = typeof boulderContext === "string" ? boulderContext : JSON.stringify(boulderContext)
    lines.push("[omo:boulder-context]", text)
    sectionHashes["omo:boulder-context"] = sha256(text)
  }
  return {
    role,
    modelFamily,
    revision,
    text: lines.join("\n\n"),
    sectionHashes,
    manifestDigest: sha256(JSON.stringify(manifest)),
  }
}

/**
 * Atomic boundary record: prompt assembly, model route and tool guard all read
 * this frozen revision so no hybrid role state can leak into one step.
 */
export function captureAssemblyBoundary(roleState, route, promptResult) {
  return Object.freeze({
    role: roleState.role,
    roleRevision: roleState.revision,
    promptRevision: promptResult.manifestDigest,
    routePolicyRevision: route?.policyRevision ?? "unknown",
    capturedAt: Date.now(),
  })
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
