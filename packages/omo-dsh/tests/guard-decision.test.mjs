import test from "node:test"
import assert from "node:assert/strict"
import { decideTool } from "../src/roles/guard-decision.mjs"

test("atlas compat: task allowed, call_omo_agent denied, write allowed", () => {
  assert.equal(decideTool({ role: "atlas", toolName: "task" }).allow, true)
  assert.equal(decideTool({ role: "atlas", toolName: "call_omo_agent" }).allow, false)
  assert.equal(decideTool({ role: "atlas", toolName: "write", args: { filePath: "src/x.ts" } }).allow, true)
})

test("atlas hardened profile: business writes denied at the guard", () => {
  const out = decideTool({ role: "atlas", toolName: "write", args: { filePath: "src/x.ts" }, profile: "deny-business-files" })
  assert.equal(out.allow, false)
  assert.ok(out.reason.includes("denies write"))
})

test("prometheus: bash denied; write to src denied; write to .omo/*.md allowed", () => {
  assert.equal(decideTool({ role: "prometheus", toolName: "bash" }).allow, false)
  const srcWrite = decideTool({ role: "prometheus", toolName: "write", args: { filePath: "src/main.ts" } })
  assert.equal(srcWrite.allow, false)
  assert.ok(srcWrite.reason.includes(".omo"))
  const planWrite = decideTool({ role: "prometheus", toolName: "edit", args: { filePath: ".omo/plans/p.md" } })
  assert.equal(planWrite.allow, true)
})

test("metis children are outside the primary guard layer", () => {
  assert.equal(decideTool({ role: "metis", toolName: "write" }).allow, true) // child guard is the child registry layer
})
