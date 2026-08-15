import test from "node:test"
import assert from "node:assert/strict"
import {
  STAGED_TOOL_CATALOG, PRIMARY_ROLE_POLICIES, CHILD_ROLE_POLICIES,
  validateRegistry, prometheusFileGuard,
} from "../src/roles/policy-registry.mjs"
import { resolveToolDecision } from "../src/compat/tools.mjs"
import { createRoleController } from "../src/roles/controller.mjs"
import { createRoleRouter } from "../src/roles/router.mjs"
import { parseRoleCommand, roleSwitchRequest } from "../src/roles/commands.mjs"
import { resolvePrimaryRoute } from "../src/roles/model-binding.mjs"

// --- policy registry ---

test("staged registry validates against the catalog with zero errors", () => {
  const errors = validateRegistry(STAGED_TOOL_CATALOG, { ...PRIMARY_ROLE_POLICIES, ...CHILD_ROLE_POLICIES })
  assert.deepEqual(errors, [])
})

test("unknown tool name and allow∩deny conflicts fail loudly", () => {
  const errors = validateRegistry(["read"], {
    ghost: { default: "deny", rules: [{ roles: ["ghost"], allow: ["teleport"] }] },
    broken: { default: "deny", rules: [{ roles: ["broken"], allow: ["read"], deny: ["read"] }] },
  })
  assert.ok(errors.some((e) => e.includes("teleport")))
  assert.ok(errors.some((e) => e.includes("both allowed and denied")))
})

test("atlas compat keeps call_omo_agent denied but hardened also blocks writes", () => {
  const compat = PRIMARY_ROLE_POLICIES.atlas.compat
  const hardened = PRIMARY_ROLE_POLICIES.atlas["deny-business-files"]
  assert.equal(resolveToolDecision(compat, "atlas", "task").decision, "allow")
  assert.equal(resolveToolDecision(compat, "atlas", "call_omo_agent").decision, "deny")
  assert.equal(resolveToolDecision(compat, "atlas", "write").decision, "deny")
  assert.equal(resolveToolDecision(hardened, "atlas", "write").decision, "deny")
})

test("prometheus broad permission map + narrow .omo file guard", () => {
  const policy = PRIMARY_ROLE_POLICIES.prometheus
  assert.equal(resolveToolDecision(policy, "prometheus", "bash").decision, "allow")
  assert.equal(resolveToolDecision(policy, "prometheus", "webfetch").decision, "allow")
  assert.equal(resolveToolDecision(policy, "prometheus", "write").decision, "deny")

  assert.equal(prometheusFileGuard(".omo/plans/roadmap.md").allowed, true)
  assert.equal(prometheusFileGuard(".omo/plans/roadmap.md").reminder, "plan-write-workflow-reminder")
  assert.equal(prometheusFileGuard("src/main.ts").allowed, false)
  assert.equal(prometheusFileGuard(".omo/notes.txt").allowed, false)
  assert.equal(prometheusFileGuard("").allowed, false)
})

test("metis profiles: opencode keeps task delegation, senpi denies it", () => {
  const opencode = CHILD_ROLE_POLICIES.metis["opencode-compat"]
  const senpi = CHILD_ROLE_POLICIES.metis["senpi-compat"]
  assert.equal(resolveToolDecision(opencode, "metis", "task").decision, "allow")
  assert.equal(resolveToolDecision(opencode, "metis", "write").decision, "deny")
  assert.equal(resolveToolDecision(senpi, "metis", "task").decision, "deny")
  assert.equal(resolveToolDecision(senpi, "metis", "read").decision, "allow")
})

test("junior: writes allowed, research delegation whitelisted, team denied", () => {
  const junior = CHILD_ROLE_POLICIES["sisyphus-junior"]
  assert.equal(resolveToolDecision(junior, "sisyphus-junior", "edit").decision, "allow")
  assert.equal(resolveToolDecision(junior, "sisyphus-junior", "teammate").decision, "deny")
  assert.deepEqual(junior.delegation.researchWhitelist, ["explore", "librarian", "oracle"])
  assert.equal(junior.delegation.categoryImplementationRecursion, "deny")
})

// --- controller ---

test("controller: set appends event, folds authority, flush required", () => {
  const controller = createRoleController()
  const result = controller.set("ses-a", { role: "atlas", reason: "plan approved", actor: "start-work" })
  assert.equal(result.applied, true)
  assert.equal(result.flushRequired, true)
  assert.equal(controller.get("ses-a").role, "atlas")
  assert.equal(controller.get("ses-a").revision, 1)
})

test("controller: invalid role/actor/reason fail before any write", () => {
  const controller = createRoleController()
  assert.throws(() => controller.set("ses-a", { role: "junior", reason: "x", actor: "user" }), /role/)
  assert.throws(() => controller.set("ses-a", { role: "atlas", reason: "x", actor: "robot" }), /actor/)
  assert.throws(() => controller.set("ses-a", { role: "atlas", reason: "", actor: "user" }), /reason/)
  assert.equal(controller.get("ses-a").revision, 0)
})

test("controller: switch during protected action queues or refuses by mode", () => {
  const controller = createRoleController()
  controller.beginProtectedAction("ses-a")
  const queued = controller.set("ses-a", { role: "prometheus", reason: "mid-step", actor: "user", mode: "queue" })
  assert.equal(queued.applied, false)
  assert.equal(queued.queued, true)
  const refused = controller.set("ses-a", { role: "hephaestus", reason: "mid-step", actor: "user", mode: "refuse" })
  assert.equal(refused.applied, false)
  assert.equal(refused.reason, "refused during protected action")

  const drained = controller.endProtectedAction("ses-a")
  assert.equal(drained.drained, 1)
  assert.equal(controller.get("ses-a").role, "prometheus")
  assert.equal(controller.get("ses-a").revision, 1)
})

test("controller: concurrent agent sessions are isolated", () => {
  const controller = createRoleController()
  controller.set("ses-a", { role: "atlas", reason: "a", actor: "user" })
  assert.equal(controller.get("ses-b").role, "sisyphus")
  assert.equal(controller.get("ses-b").revision, 0)
})

// --- commands ---

test("only parsed commands can request a switch", () => {
  assert.equal(parseRoleCommand("请用 start work"), null)
  assert.equal(parseRoleCommand("/omo-role status").kind, "status")
  assert.equal(parseRoleCommand("/omo-role atlas plan approved").kind, "switch")
  assert.equal(parseRoleCommand("/omo-role atlas plan approved").reason, "plan approved")
  assert.equal(parseRoleCommand("/omo-role junior").kind, "invalid")
  assert.equal(roleSwitchRequest("start work now"), null)
  const request = roleSwitchRequest("/omo-role atlas approved")
  assert.deepEqual(request, { role: "atlas", reason: "approved", actor: "user" })
})

// --- router ---

const sections = [
  { key: "omo:identity", text: "i" }, { key: "omo:role", text: "r" },
  { key: "omo:operating-principles", text: "op" }, { key: "omo:planning-policy", text: "p" },
  { key: "omo:delegation-policy", text: "d" }, { key: "omo:verification-policy", text: "v" },
  { key: "omo:continuation-policy", text: "c" }, { key: "omo:catalog", text: "cat" },
  { key: "omo:boulder-context", text: "b" }, { key: "omo:project-context", text: "proj" },
]
const manifests = [
  { role: "sisyphus", modelFamily: "deepseek-v4", sections },
  { role: "atlas", modelFamily: "deepseek-v4", sections },
]

test("router resolves active role and empty-inactive with mandatory intact", () => {
  const router = createRoleRouter({ manifests })
  const active = router.resolve({ role: "sisyphus", revision: 1 }, "deepseek-v4")
  assert.ok(active.text.startsWith("[omo:identity]"))
  // active role with a modelFamily that has no dedicated manifest → empty text
  const inactive = router.resolve({ role: "atlas", revision: 1 }, "gpt")
  assert.equal(inactive.text, "")
  // a role with no manifest at all is a configuration error
  assert.throws(() => router.resolve({ role: "prometheus", revision: 1 }, "deepseek-v4"), /no manifest for role/)
  // manifest missing a mandatory policy section fails at router construction
  assert.throws(
    () => createRoleRouter({ manifests: [{ role: "atlas", modelFamily: "deepseek-v4", sections: sections.slice(0, 5) }] }),
    /invalid manifests/,
  )
})

// --- model binding ---

const aliases = {
  "primary.deep": { provider: "p1", model: "deep", capabilities: ["text", "tools"], promptFamily: "deepseek-v4" },
  "primary.fast": { provider: "p2", model: "fast", capabilities: ["text", "tools"], promptFamily: "deepseek-v4" },
  "planning.interview": { provider: "p3", model: "chat", capabilities: ["text"], promptFamily: "gpt" },
  "vision.default": { provider: "p4", model: "v", capabilities: ["text", "vision"], promptFamily: "gpt" },
}

test("role defaults bind frozen route with policy revision", () => {
  const binding = resolvePrimaryRoute({ role: "prometheus", aliases })
  assert.equal(binding.status, "ok")
  assert.equal(binding.aliasId, "planning.interview")
  assert.equal(binding.promptFamily, "gpt")
  assert.ok(binding.policyRevision.length === 64)
  assert.ok(Object.isFrozen(binding))
})

test("category overrides role default; missing alias fails", () => {
  const binding = resolvePrimaryRoute({ role: "sisyphus", category: "multimodal", aliases, requiredCapabilities: ["vision"] })
  assert.equal(binding.aliasId, "vision.default")
  assert.equal(resolvePrimaryRoute({ role: "sisyphus", aliases }).aliasId, "primary.deep")
  assert.throws(() => resolvePrimaryRoute({ role: "sisyphus", aliases: {} }), /missing/)
})

test("capability mismatch is reported, never silently degraded", () => {
  const binding = resolvePrimaryRoute({ role: "prometheus", aliases, requiredCapabilities: ["vision"] })
  assert.equal(binding.status, "capability-mismatch")
  assert.deepEqual(binding.missing, ["vision"])
})
