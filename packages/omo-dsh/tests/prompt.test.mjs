import test from "node:test"
import assert from "node:assert/strict"
import { validatePromptManifest, assemblePrompt, captureAssemblyBoundary, SECTION_ORDER, sha256 } from "../src/compat/prompt.mjs"
import { reduceRoleFold } from "../src/compat/session.mjs"

const manifest = {
  role: "sisyphus",
  modelFamily: "deepseek-v4",
  sections: [
    { key: "omo:identity", text: "identity" },
    { key: "omo:role", text: "role" },
    { key: "omo:operating-principles", text: "op" },
    { key: "omo:planning-policy", text: "plan" },
    { key: "omo:delegation-policy", text: "delegate" },
    { key: "omo:verification-policy", text: "verify" },
    { key: "omo:continuation-policy", text: "continue" },
    { key: "omo:catalog", text: "catalog" },
    { key: "omo:boulder-context", text: "boulder" },
    { key: "omo:project-context", text: "project" },
  ],
}

test("manifest validates when all mandatory sections exist", () => {
  assert.deepEqual(validatePromptManifest(manifest), [])
})

test("manifest rejects missing mandatory policy section and duplicates", () => {
  const withoutDelegation = { ...manifest, sections: manifest.sections.filter((s) => s.key !== "omo:delegation-policy") }
  assert.ok(validatePromptManifest(withoutDelegation).some((e) => e.includes("mandatory")))
  const dup = { ...manifest, sections: [...manifest.sections, manifest.sections[0]] }
  assert.ok(validatePromptManifest(dup).some((e) => e.includes("duplicate")))
})

test("assembly emits ordered sections with stable hash", () => {
  const a = assemblePrompt(manifest, { role: "sisyphus", modelFamily: "deepseek-v4", revision: 1 })
  const b = assemblePrompt(manifest, { role: "sisyphus", modelFamily: "deepseek-v4", revision: 1 })
  assert.equal(a.text, b.text)
  assert.equal(a.manifestDigest, b.manifestDigest)
  assert.ok(a.text.startsWith("[omo:identity]"))
  assert.equal(a.sectionHashes["omo:identity"], sha256("identity"))
})

test("inactive role/model-family resolves to empty sections", () => {
  const out = assemblePrompt(manifest, { role: "atlas", modelFamily: "deepseek-v4", revision: 1 })
  assert.equal(out.text, "")
  assert.equal(out.sectionHashes["omo:delegation-policy"], "")
})

test("mandatory policy section cannot be emptied by override", () => {
  assert.throws(
    () => assemblePrompt(manifest, { role: "sisyphus", modelFamily: "deepseek-v4", revision: 1, overrides: { "omo:delegation-policy": "" } }),
    /cannot be emptied/,
  )
})

test("unknown override key fails", () => {
  assert.throws(
    () => assemblePrompt(manifest, { role: "sisyphus", modelFamily: "deepseek-v4", revision: 1, overrides: { "unknown:section": "x" } }),
    /unknown section/,
  )
})

test("atomic boundary captures one frozen revision", () => {
  const roleState = reduceRoleFold([{ type: "omo/role", seq: 1, time: 1, data: { schemaVersion: 1, role: "atlas", revision: 2, changedBy: "start-work", reason: "approved", changedAt: "2026-08-15T12:00:00.000Z" } }])
  const prompt = assemblePrompt(manifest, { role: roleState.role, modelFamily: "deepseek-v4", revision: roleState.revision })
  const boundary = captureAssemblyBoundary(roleState, { policyRevision: "r7" }, prompt)
  assert.equal(boundary.role, "atlas")
  assert.equal(boundary.roleRevision, 2)
  assert.equal(boundary.routePolicyRevision, "r7")
  assert.equal(boundary.promptRevision, prompt.manifestDigest)
  assert.ok(Object.isFrozen(boundary))
})

test("section order keys are the ten documented omo sections", () => {
  assert.deepEqual(Object.keys(SECTION_ORDER).sort(), [
    "omo:boulder-context", "omo:catalog", "omo:continuation-policy", "omo:delegation-policy",
    "omo:identity", "omo:operating-principles", "omo:planning-policy", "omo:project-context",
    "omo:role", "omo:verification-policy",
  ])
})

// --- CT-07: scoped shadow/dispose section registry ---

test("section registry shadows by name (last-write-wins) and invokes the previous disposer", async () => {
  const { createSectionRegistry } = await import("../src/compat/prompt.mjs")
  const registry = createSectionRegistry()
  registry.register({ name: "omo:role", order: 20, text: "sisyphus text" })
  registry.register({ name: "omo:role", order: 20, text: "prometheus text" })
  const list = registry.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].text, "prometheus text")
})

test("section registry dispose removes exactly one registration and stale disposers are inert", async () => {
  const { createSectionRegistry } = await import("../src/compat/prompt.mjs")
  const registry = createSectionRegistry()
  const dispose = registry.register({ name: "omo:role", order: 20, text: "t" })
  dispose()
  assert.equal(registry.list().length, 0)
  dispose() // stale disposer: no-op, no throw
  assert.equal(registry.list().length, 0)
})

test("section registry sorts by (order, insertion)", async () => {
  const { createSectionRegistry } = await import("../src/compat/prompt.mjs")
  const registry = createSectionRegistry()
  registry.register({ name: "b", order: 20, text: "b" })
  registry.register({ name: "a", order: 10, text: "a" })
  registry.register({ name: "c", order: 20, text: "c" })
  assert.deepEqual(registry.list().map((s) => s.name), ["a", "b", "c"])
})

test("section registry rejects malformed sections", async () => {
  const { createSectionRegistry } = await import("../src/compat/prompt.mjs")
  const registry = createSectionRegistry()
  assert.throws(() => registry.register({}), /section.name/)
  assert.throws(() => registry.register({ name: "x" }), /\.text/)
})
