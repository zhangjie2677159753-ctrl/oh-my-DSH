import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DYNAMIC_SECTION_ORDERS,
  buildRoleStateSection,
  buildGuardSummarySection,
  buildWorkSection,
  buildDynamicSections,
} from "../src/roles/dynamic-sections.mjs"

test("section orders slot between omo:identity (-50) and persona (0)", () => {
  assert.deepEqual(DYNAMIC_SECTION_ORDERS, {
    "omo:current-role": -40,
    "omo:guard-status": -30,
    "omo:work": -20,
  })
  for (const order of Object.values(DYNAMIC_SECTION_ORDERS)) {
    assert.ok(order > -50 && order < 0)
  }
})

test("role state section reports role and revision, never invents one", () => {
  const withRev = buildRoleStateSection({ role: "prometheus", revision: 3 })
  assert.ok(withRev.text.includes("prometheus"))
  assert.ok(withRev.text.includes("(revision 3)"))
  const withoutRev = buildRoleStateSection({ role: "atlas" })
  assert.ok(withoutRev.text.includes("atlas"))
  assert.ok(!withoutRev.text.includes("revision"))
  assert.equal(withRev.name, "omo:current-role")
})

test("guard summary lists every active denial from guard-decision outputs", () => {
  // decideTool shape: no toolName field, tool name embedded in reason
  const denials = [
    { allow: false, reason: "omo role prometheus denies bash" },
    { toolName: "task", allow: false, reason: "delegation denied" },
    { toolName: "read", allow: true }, // allowed decisions are not denials
  ]
  const section = buildGuardSummarySection({ denials })
  assert.ok(section.text.includes("- bash: denied (omo role prometheus denies bash)"))
  assert.ok(section.text.includes("- task: denied (delegation denied)"))
  assert.ok(!section.text.includes("read: denied"))
})

test("guard summary degrades to minimal honest text on empty input", () => {
  const empty = buildGuardSummarySection()
  assert.ok(empty.text.includes("none"))
  assert.ok(empty.text.includes("denial"))
})

test("work section mirrors the Boulder projection in one line", () => {
  const withWork = buildWorkSection({ work: { id: "w-1", agent: "sisyphus" } })
  assert.equal(withWork.text, "Active work: w-1 (agent: sisyphus)")
  const none = buildWorkSection()
  assert.equal(none.text, "Active work: none.")
})

test("buildDynamicSections returns stable ordered sections for arbitrary input", () => {
  const sections = buildDynamicSections({})
  assert.deepEqual(sections.map((s) => s.name), ["omo:current-role", "omo:guard-status", "omo:work"])
  const orders = sections.map((s) => s.order)
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b))
  for (const s of sections) {
    assert.equal(typeof s.text, "string")
    assert.ok(s.text.length > 0)
  }
})
