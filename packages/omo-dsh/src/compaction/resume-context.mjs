// omo-dsh compaction resume context (OMO-2101/2102), pure part.
// Builds the MINIMAL owned snapshot injected after compaction:
// current role, work/plan identity + revision, next task, recent evidence,
// and blockers. Everything must be lossless JSON (never live DSH objects).
import { isLosslessJsonValue } from "../compat/session.mjs"

export function buildResumeContext({ roleState, work = null, plan = null, nextTask = null, recentEvidence = [], blockers = [], tokenBudget = 8000 } = {}) {
  const context = {
    schemaVersion: 1,
    role: { name: roleState.role, revision: roleState.revision },
    work: work ? { id: work.id, planName: work.planName, status: work.status, revision: work.revision ?? null } : null,
    plan: plan ? { planId: plan.planId, revision: plan.revision, digest: plan.digest ?? null } : null,
    nextTask: nextTask ? { key: nextTask.key, title: nextTask.title } : null,
    recentEvidence: recentEvidence.slice(-3).map((e) => ({
      key: e.key, command: e.command, exitCode: e.exitCode, at: e.at ?? null,
    })),
    blockers: blockers.slice(-3).map((b) => String(b)),
  }
  if (!isLosslessJsonValue(context)) {
    throw new TypeError("buildResumeContext: resume context must be lossless JSON (no live objects)")
  }
  const text = JSON.stringify(context)
  if (text.length > tokenBudget * 4) {
    throw new Error(`buildResumeContext: snapshot exceeds token budget (${text.length} chars for ${tokenBudget} tokens)`)
  }
  return { context, approximateTokens: Math.ceil(text.length / 4), text }
}

export function assertResumeContinuity(previousContext, nextContext) {
  const errors = []
  if (previousContext.role.name !== nextContext.role.name) {
    errors.push(`role changed across compaction: ${previousContext.role.name} → ${nextContext.role.name}`)
  }
  if (previousContext.work && nextContext.work && previousContext.work.id !== nextContext.work.id) {
    errors.push(`work changed across compaction: ${previousContext.work.id} → ${nextContext.work.id}`)
  }
  if (previousContext.plan && nextContext.plan && previousContext.plan.planId !== nextContext.plan.planId) {
    errors.push("plan identity changed across compaction")
  }
  return errors
}
