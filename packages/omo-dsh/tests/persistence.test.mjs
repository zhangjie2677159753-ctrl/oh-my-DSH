import test from "node:test"
import assert from "node:assert/strict"
import {
  checkpointPolicy,
  isFlushed,
  assertFlushed,
  createSurface,
  appendSurfaceNode,
  replaceSurfaceNodes,
  applyCompaction,
} from "../src/compat/persistence.mjs"

test("checkpoint policy: role/goal/boulder/verification transitions must flush", () => {
  assert.equal(checkpointPolicy("omo/role").flushRequired, true)
  assert.equal(checkpointPolicy("goal/change").flushRequired, true)
  assert.equal(checkpointPolicy("turn/end").flushRequired, false)
})

test("flush watermark gates dependent steps", () => {
  assert.equal(isFlushed(5, 5), true)
  assert.equal(isFlushed(6, 5), false)
  assert.throws(() => assertFlushed(6, 5, "start-work"), /not durable/)
  assert.doesNotThrow(() => assertFlushed(5, 5, "start-work"))
})

test("surface append and range-replace with mandatory provenance", () => {
  const surface = createSurface()
  assert.equal(appendSurfaceNode(surface, { id: "a", sourceEventSeqs: [1] }), 0)
  assert.equal(appendSurfaceNode(surface, { id: "b", sourceEventSeqs: [2] }), 1)
  assert.equal(appendSurfaceNode(surface, { id: "c", sourceEventSeqs: [3] }), 2)

  const ok = replaceSurfaceNodes(surface, {
    start: 1, end: 2,
    replacement: { id: "bc", sourceEventSeqs: [{ id: "b", seq: 2 }, { id: "c", seq: 3 }] },
  })
  assert.deepEqual(ok.replaced, ["b", "c"])
  assert.equal(surface.nodes.length, 2)
  assert.equal(surface.nodes[1].id, "bc")
})

test("replace out of bounds or missing provenance fails", () => {
  const surface = createSurface()
  appendSurfaceNode(surface, { id: "a", sourceEventSeqs: [1] })
  assert.throws(() => replaceSurfaceNodes(surface, { start: 0, end: 1, replacement: { id: "x", sourceEventSeqs: [] } }), /exceeds/)
  assert.throws(() => replaceSurfaceNodes(surface, { start: 1, end: 0, replacement: { id: "x", sourceEventSeqs: [] } }), /invalid range/)
  assert.throws(
    () => replaceSurfaceNodes(surface, { start: 0, end: 0, replacement: { id: "x", sourceEventSeqs: [] } }),
    /must cite shadowed/,
  )
})

test("compaction preserves canonical events and only appends records", () => {
  const events = [
    { type: "turn/start", seq: 1, data: {} },
    { type: "omo/role", seq: 2, data: {}, surfaceOp: "append" },
    { type: "compaction/start", seq: 3, data: {} },
    { type: "compaction/summary", seq: 4, data: { node: { id: "summary-1", sourceEventSeqs: [] } } },
    { type: "compaction/end", seq: 5, data: {} },
  ]
  const out = applyCompaction(events)
  assert.equal(out.canonicalCount, 2)
  assert.equal(out.compactionRecords, 3)
  assert.equal(out.surface.nodes.length, 2) // role append + summary node
})

test("compaction never deletes canonical events from the log", () => {
  const before = [
    { type: "turn/start", seq: 1, data: {} },
    { type: "omo/role", seq: 2, data: {}, surfaceOp: "append" },
  ]
  const withCompaction = [
    ...before,
    { type: "compaction/start", seq: 3, data: {} },
    { type: "compaction/end", seq: 4, data: {} },
  ]
  const out = applyCompaction(withCompaction)
  assert.equal(out.canonicalCount, 2)
  assert.deepEqual(withCompaction.slice(0, before.length), before)
})
