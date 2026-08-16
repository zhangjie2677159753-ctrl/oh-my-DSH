import test from "node:test"
import assert from "node:assert/strict"
import { buildSpawnRequest, promptTextBlock } from "../src/tasks/spawn-request.mjs"

const descriptor = { kind: "foreground", invocationId: "i1", parentSessionId: "p1" }
const fullCapabilities = ["outputSchema", "depthLimit", "toolFilter", "persona"]

test("spawn request maps descriptor + launch spec onto verified DSH vocabulary", () => {
  const out = buildSpawnRequest({
    descriptor,
    childRole: "explore",
    providerCapabilities: fullCapabilities,
    promptBlocks: promptTextBlock("find X"),
    maxDepth: 1,
  })
  assert.equal(out.ok, true, out.errors.join(";"))
  const request = out.request
  assert.equal(request.kind, "foreground")
  assert.equal(request.persona, "omo-child:explore")
  assert.equal(request.parent, "p1")
  assert.equal(request.maxDepth, 1)
  assert.ok(request.toolFilter.deny.includes("task"))
  assert.equal(request.prompt.length, 1)
  assert.equal(request.prompt[0].type, "text")
})

test("missing provider capability fails before launch", () => {
  const out = buildSpawnRequest({
    descriptor,
    childRole: "explore",
    providerCapabilities: ["toolFilter"],
    promptBlocks: promptTextBlock("x"),
  })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("persona")))
})

test("continuable descriptor drops outputSchema in the request", () => {
  const out = buildSpawnRequest({
    descriptor: { ...descriptor, kind: "continuable-session" },
    childRole: "oracle",
    providerCapabilities: fullCapabilities,
    promptBlocks: promptTextBlock("advise"),
    outputSchema: { type: "object" },
  })
  // provider has outputSchema so capabilities pass; the mapper itself keeps
  // continuable requests schema-free (runtime rejects combination loudly)
  assert.equal(out.request.outputSchema, null)
})

test("empty prompt blocks rejected", () => {
  const out = buildSpawnRequest({ descriptor, childRole: "explore", providerCapabilities: fullCapabilities, promptBlocks: [] })
  assert.equal(out.ok, false)
  assert.ok(out.errors.some((e) => e.includes("promptBlocks")))
})

test("unknown child role propagates registry error", () => {
  const out = buildSpawnRequest({ descriptor, childRole: "ghost", providerCapabilities: fullCapabilities, promptBlocks: promptTextBlock("x") })
  assert.equal(out.ok, false)
})
