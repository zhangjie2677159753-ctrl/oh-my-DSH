import test from "node:test"
import assert from "node:assert/strict"
import { resolveChildSpec, buildChildRegistry, toLaunchSpec } from "../src/children/registry.mjs"
import { createBoulderRepository, createMemoryFs, sha256Of } from "../src/boulder/repository.mjs"
import { validateVariantManifest, scoreVariant, buildEvalManifest } from "../src/prompts/eval-plan.mjs"

// --- E10 child registry ---

test("all eight child roles resolve in both profiles", () => {
  for (const profile of ["opencode-compat", "senpi-compat"]) {
    const registry = buildChildRegistry({ profile })
    assert.equal(registry.ok, true, registry.errors.join(";"))
    assert.equal(Object.keys(registry.specs).length, 8)
  }
})

test("metis profile difference is observable in the launch spec", () => {
  const opencode = toLaunchSpec(resolveChildSpec({ role: "metis", profile: "opencode-compat" }))
  const senpi = toLaunchSpec(resolveChildSpec({ role: "metis", profile: "senpi-compat" }))
  assert.equal(opencode.toolFilter.deny.includes("task"), true)
  assert.equal(senpi.toolFilter.deny.includes("task"), true)
  assert.equal(senpi.toolFilter.deny.includes("task_send"), true)
  assert.equal(opencode.toolFilter.deny.includes("write"), true)
  assert.equal(opencode.toolFilter.allow.includes("read"), true)
})

test("junior launch spec carries the research whitelist and denies task", () => {
  const junior = toLaunchSpec(resolveChildSpec({ role: "sisyphus-junior", profile: "opencode-compat" }))
  assert.deepEqual(junior.delegationWhitelist, ["explore", "librarian", "oracle"])
  assert.equal(junior.toolFilter.deny.includes("task"), true)
  assert.equal(junior.toolFilter.allow.includes("call_omo_agent"), true)
})

test("unknown role or profile fails loudly", () => {
  assert.equal(resolveChildSpec({ role: "teleporter" }).status, "error")
  assert.equal(resolveChildSpec({ role: "explore", profile: "wat" }).status, "error")
})

// --- E14 boulder repository ---

test("atomic write + read round-trip with digest", async () => {
  const repo = createBoulderRepository({ fs: createMemoryFs() })
  const written = await repo.write("boulder.json", { active_plan: "p", plan_name: "p", status: "active" })
  assert.equal(written.status, "written")
  const read = await repo.read("boulder.json")
  assert.equal(read.status, "ok")
  assert.equal(read.digest, written.digest)
  assert.equal(read.state.active_plan, "p")
})

test("crash between temp write and rename leaves the old file untouched", async () => {
  const fs = createMemoryFs()
  const repo = createBoulderRepository({ fs })
  const first = await repo.write("b.json", { status: "active", plan_name: "v1" })
  // simulate crash: write temp, then NO rename
  await fs.writeFile("b.json.tmp-crash", JSON.stringify({ status: "paused", plan_name: "v2" }))
  const read = await repo.read("b.json")
  assert.equal(read.digest, first.digest)
  assert.equal(read.state.plan_name, "v1")
})

test("digest CAS rejects conflicting writes", async () => {
  const repo = createBoulderRepository({ fs: createMemoryFs() })
  await repo.write("b.json", { status: "active", plan_name: "v1" })
  await assert.rejects(
    () => repo.write("b.json", { status: "paused", plan_name: "v2" }, { expectedDigest: "stale" }),
    /conflict/,
  )
})

test("corrupt JSON and unsupported schema_version fail closed", async () => {
  const fs = createMemoryFs()
  const repo = createBoulderRepository({ fs })
  await fs.writeFile("bad.json", "{not json")
  assert.equal((await repo.read("bad.json")).status, "corrupt")

  await fs.writeFile("future.json", JSON.stringify({ schema_version: 9, active_plan: "x", plan_name: "x", status: "active" }))
  const future = await repo.read("future.json")
  assert.equal(future.status, "unsupported-version")
})

test("revision bump is explicit and CAS-protected", async () => {
  const repo = createBoulderRepository({ fs: createMemoryFs() })
  await repo.write("b.json", { status: "active", plan_name: "v1", revision: 3 })
  const next = await repo.bumpRevision("b.json")
  assert.equal(next, 4)
  const read = await repo.read("b.json")
  assert.equal(read.state.revision, 4)
  assert.equal(read.state.schema_version, 2)
})

// --- E07 eval skeleton ---

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
    { id: "no-claim-without-evidence", check: "assistant claims completion only after machine evidence" },
    { id: "final-wave", check: "assistant treats Final Verification Wave as mandatory" },
  ],
}

test("variant without mandatory sections or assertions never releases", () => {
  const bad = { ...variant, sections: [variant.sections[0]], assertions: [] }
  const errors = validateVariantManifest(bad)
  assert.ok(errors.some((e) => e.includes("mandatory")))
  assert.ok(errors.some((e) => e.includes("assertions")))
})

test("scoreVariant enforces the 0.9 threshold and pins a digest", () => {
  const passing = scoreVariant(variant, [
    { id: "no-claim-without-evidence", pass: true, evidence: "e1" },
    { id: "final-wave", pass: true, evidence: "e2" },
  ])
  assert.equal(passing.score, 1)
  assert.equal(passing.release, true)
  assert.equal(passing.digest.length, 64)

  const failing = scoreVariant(variant, [
    { id: "no-claim-without-evidence", pass: true },
    { id: "final-wave", pass: false },
  ])
  assert.equal(failing.release, false)
  assert.ok(failing.evaluated.some((e) => e.id === "final-wave" && e.pass === false))
})

test("eval manifest requires a non-empty scenario corpus", () => {
  const manifest = buildEvalManifest({ variants: [variant], scenarios: [] })
  assert.equal(manifest.ok, false)
  const good = buildEvalManifest({ variants: [variant], scenarios: ["single-file-bug"] })
  assert.equal(good.ok, true)
  assert.equal(good.manifest.scenarios.length, 1)
  assert.equal(sha256Of("x").length, 64)
})
