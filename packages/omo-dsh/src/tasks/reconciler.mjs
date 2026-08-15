// omo-dsh orphan/task reconciler (OMO-1101 recovery half), pure part.
// Reconciles durable descriptors against live process state:
// - continuable sessions stay durable; a job (process-local) with no live
//   handle after restart is terminal/lost, never a fake "running"
// - orphan descriptors whose parent no longer exists are surfaced for
//   attach/cancel/lost decisions — never silently dropped
import { resolveColdContinuation } from "../compat/subagents.mjs"

export function reconcileDescriptors({ descriptors = [], liveJobs = new Set(), liveSessions = new Set(), parents = new Set(), provider }) {
  const results = []
  for (const descriptor of descriptors) {
    if (descriptor.kind === "job") {
      if (liveJobs.has(descriptor.id)) {
        results.push({ id: descriptor.id, status: "running", kind: "job" })
      } else {
        results.push({ id: descriptor.id, status: "lost", kind: "job", note: "process-local job: restart means terminal/lost" })
      }
      continue
    }
    if (descriptor.kind !== "continuable-session") {
      results.push({ id: descriptor.id, status: "invalid", reason: `unknown kind ${descriptor.kind}` })
      continue
    }
    if (!parents.has(descriptor.parentSessionId)) {
      results.push({ id: descriptor.id, status: "orphan", kind: descriptor.kind, note: "parent session no longer exists" })
      continue
    }
    const live = liveSessions.has(descriptor.id)
    const cold = resolveColdContinuation({
      provider,
      hasLiveActivation: live,
      canReactivate: provider?.capabilities?.includes("continuable") ?? false,
      canStartNewTurn: provider?.capabilities?.includes("continuable") ?? false,
    })
    results.push({ id: descriptor.id, status: cold, kind: descriptor.kind, live })
  }
  return results
}

/** Attach policy: an orphan may be attached only when its parent reappears; cancel/lost otherwise. */
export function classifyOrphan(orphan, { parentExists, providerSupportsContinuable }) {
  if (parentExists && providerSupportsContinuable) return { action: "attach", orphan }
  if (parentExists) return { action: "cancel", orphan, reason: "provider cannot resume continuable children" }
  return { action: "lost", orphan, reason: "parent gone; history retained for audit" }
}
