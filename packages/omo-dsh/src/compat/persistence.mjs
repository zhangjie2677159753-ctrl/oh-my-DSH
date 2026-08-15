// omo-dsh persistence/compaction adapter, pure part (OMO-0206).
// DSH facts honored at fixed SHA:
// - turn/end does NOT imply flush; important transitions must checkpoint
//   explicitly and consumers read storage only after whenIdle()/flush.
// - Compaction appends surface replacement records (compaction/start|summary|end);
//   canonical session events are NEVER deleted. The ordered surface is a
//   derived view: replace nodes must cite every shadowed surface node.

/** Decide whether a transition needs a durability checkpoint before proceeding. */
export const FLUSH_REQUIRED_KINDS = new Set(["omo/role", "goal/change", "boulder/commit", "omo/verification"])

export function checkpointPolicy(eventType) {
  return { flushRequired: FLUSH_REQUIRED_KINDS.has(eventType), eventType }
}

export function isFlushed(eventSeq, lastFlushedSeq) {
  return eventSeq <= lastFlushedSeq
}

export function assertFlushed(eventSeq, lastFlushedSeq, context) {
  if (!isFlushed(eventSeq, lastFlushedSeq)) {
    throw new Error(`assertFlushed(${context}): event seq ${eventSeq} not durable (lastFlushedSeq=${lastFlushedSeq})`)
  }
  return true
}

// --- ordered surface + compaction replace semantics ---

export function createSurface() {
  return { nodes: [] } // nodes: { id, sourceEventSeqs: number[] }
}

export function appendSurfaceNode(surface, node) {
  validateNode(node)
  surface.nodes.push({ ...node })
  return surface.nodes.length - 1
}

function validateNode(node) {
  if (node === null || typeof node !== "object") throw new TypeError("surface node: expected object")
  if (typeof node.id !== "string" || node.id.length === 0) throw new TypeError("surface node: id required")
  if (!Array.isArray(node.sourceEventSeqs)) throw new TypeError(`surface node ${node.id}: sourceEventSeqs must be an array`)
}

/**
 * Apply a surface replace op. Contract: start..end (inclusive) must exist and
 * the replacement must cite every shadowed node so no provenance is lost.
 */
export function replaceSurfaceNodes(surface, { start, end, replacement }) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new TypeError(`replaceSurfaceNodes: invalid range [${start}, ${end}]`)
  }
  if (end >= surface.nodes.length) {
    throw new TypeError(`replaceSurfaceNodes: range [${start}, ${end}] exceeds surface length ${surface.nodes.length}`)
  }
  validateNode(replacement)
  const shadowed = surface.nodes.slice(start, end + 1).map((n) => n.id)
  const cited = new Set(replacement.sourceEventSeqs.map((n) => n.id))
  const missing = shadowed.filter((id) => !cited.has(id))
  if (missing.length > 0) {
    throw new TypeError(`replaceSurfaceNodes: replacement must cite shadowed nodes: ${missing.join(", ")}`)
  }
  surface.nodes.splice(start, end - start + 1, { ...replacement })
  return { replaced: shadowed, length: surface.nodes.length }
}

/**
 * Apply ordered compaction records over a canonical event list.
 * Canonical events are preserved verbatim (compaction only appends records);
 * returns the resulting surface plus how many canonical events survive.
 */
export function applyCompaction(events, surfaceFactory = createSurface) {
  const surface = surfaceFactory()
  let canonicalCount = 0
  let inCompaction = false
  for (const event of events) {
    if (event.type === "compaction/start") { inCompaction = true; continue }
    if (event.type === "compaction/summary") {
      // summary carries the replacement surface node
      appendSurfaceNode(surface, event.data?.node ?? { id: "summary", sourceEventSeqs: [] })
      continue
    }
    if (event.type === "compaction/end") { inCompaction = false; continue }
    canonicalCount += 1
    if (event.type !== "omo/role" && event.type !== "goal/change") continue
    // ordinary append onto the surface view for known surface kinds
    if (!inCompaction && event.surfaceOp !== undefined) {
      appendSurfaceNode(surface, { id: `${event.type}#${event.seq}`, sourceEventSeqs: [event.seq] })
    }
  }
  return { surface, canonicalCount, compactionRecords: events.length - canonicalCount }
}
