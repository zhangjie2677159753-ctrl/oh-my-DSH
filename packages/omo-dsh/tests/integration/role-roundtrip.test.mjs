// G2 contract-level gate: four-role roundtrip in one session.
// 100 switches across all four primary roles must leave the tool catalog
// stable, every step reads one frozen role revision, and the guard resolves
// the same role the prompt assembled.
import test from "node:test"
import assert from "node:assert/strict"
import { createRoleController } from "../../src/roles/controller.mjs"
import { createRoleRouter } from "../../src/roles/router.mjs"
import { buildRoleManifests } from "../../src/roles/manifests.mjs"
import { PRIMARY_ROLE_POLICIES, STAGED_TOOL_CATALOG } from "../../src/roles/policy-registry.mjs"
import { resolveToolDecision } from "../../src/compat/tools.mjs"
import { resolvePrimaryRoute } from "../../src/roles/model-binding.mjs"

const aliases = {
  "primary.deep": { provider: "p1", model: "deep", capabilities: ["text", "tools"], promptFamily: "deepseek-v4" },
  "planning.interview": { provider: "p3", model: "chat", capabilities: ["text"], promptFamily: "gpt" },
}

test("100 four-role switches: stable catalog, frozen revisions, guard consistency", () => {
  const controller = createRoleController()
  const router = createRoleRouter({ manifests: buildRoleManifests() })
  const roles = ["sisyphus", "hephaestus", "prometheus", "atlas"]
  const catalogBefore = [...STAGED_TOOL_CATALOG].sort().join(",")

  for (let i = 0; i < 100; i++) {
    const role = roles[i % 4]
    const result = controller.set("ses-round", { role, reason: `round ${i}`, actor: "user" })
    assert.equal(result.applied, true, `switch ${i} failed`)

    const roleState = controller.get("ses-round")
    assert.equal(roleState.role, role)

    // one frozen revision per step: prompt assembly, route and guard agree
    const prompt = router.resolve(roleState, "deepseek-v4")
    assert.ok(prompt.manifestDigest.length === 64)
    const binding = resolvePrimaryRoute({ role: roleState.role, aliases })
    assert.equal(binding.status, "ok")
    const policy = PRIMARY_ROLE_POLICIES[role]
    const guard = resolveToolDecision(policy, role, "read")
    assert.ok(["allow", "deny"].includes(guard.decision))
    assert.equal(guard.role, role)

    // catalog never changes across switches (no re-registration)
    assert.equal([...STAGED_TOOL_CATALOG].sort().join(","), catalogBefore)
  }

  assert.equal(controller.get("ses-round").revision, 100)
})

test("prometheus prompt carries planning policy while atlas carries execution policy", () => {
  const router = createRoleRouter({ manifests: buildRoleManifests() })
  const prometheus = router.resolve({ role: "prometheus", revision: 1 }, "deepseek-v4")
  const atlas = router.resolve({ role: "atlas", revision: 1 }, "deepseek-v4")
  assert.ok(prometheus.text.includes("Planner"))
  assert.ok(prometheus.text.includes("never implement business code"))
  assert.ok(prometheus.text.includes("/start-work"))
  assert.ok(atlas.text.includes("Final Verification Wave"))
  assert.ok(atlas.text.includes("dependency gate"))
  // mandatory policy sections survive in both
  for (const section of ["omo:delegation-policy", "omo:verification-policy", "omo:continuation-policy"]) {
    assert.ok(prometheus.sectionHashes[section].length === 64)
    assert.ok(atlas.sectionHashes[section].length === 64)
  }
})

test("protected action queues a switch; the step never reads a hybrid role", () => {
  const controller = createRoleController()
  const router = createRoleRouter({ manifests: buildRoleManifests() })
  controller.set("ses-p", { role: "sisyphus", reason: "init", actor: "system" })
  controller.beginProtectedAction("ses-p")
  const queued = controller.set("ses-p", { role: "atlas", reason: "mid-step", actor: "user", mode: "queue" })
  assert.equal(queued.applied, false)
  // the in-flight step still assembles the OLD frozen role
  const inFlight = router.resolve(controller.get("ses-p"), "deepseek-v4")
  assert.ok(inFlight.text.includes("sisyphus"))
  controller.endProtectedAction("ses-p")
  assert.equal(controller.get("ses-p").role, "atlas")
})
