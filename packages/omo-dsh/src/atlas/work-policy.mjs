// omo-dsh Atlas work policy (OMO-1603..1605), pure part.
// - dependency gate: only tasks whose dependencies are all completed may run
// - scope change: plan contradiction, new scope, or destructive operations
//   escalate instead of silently executing
// - completion gate: every todo AND every final-wave item needs passing
//   machine evidence before the work can complete
export function evaluateDependencyGate(plan, taskIndex) {
  const task = plan.tasks[taskIndex]
  if (!task) return { ready: false, reason: "unknown-task", taskIndex }
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const missing = []
  for (const dep of task.dependencies ?? []) {
    const dependency = byId.get(dep)
    if (!dependency || dependency.status !== "completed") missing.push(dep)
  }
  return missing.length === 0
    ? { ready: true, taskIndex, taskId: task.id }
    : { ready: false, reason: "dependencies-not-completed", missing, taskId: task.id }
}

export function checkScopeChange({ plan, planDigestAtApproval, currentDigest, request, workStatus }) {
  const findings = []
  if (currentDigest !== planDigestAtApproval) {
    findings.push({ kind: "plan-contradiction", detail: "plan digest changed since approval" })
  }
  if (workStatus === "completed" && request !== undefined) {
    findings.push({ kind: "work-completed", detail: "request targets a completed work" })
  }
  if (request?.destructive === true) {
    findings.push({ kind: "destructive", detail: "destructive operation requires explicit escalation" })
  }
  if (request?.scope && plan.title !== undefined && request.scope !== plan.title && request.newScope === true) {
    findings.push({ kind: "new-scope", detail: `new scope ${JSON.stringify(request.scope)} outside plan "${plan.title}"` })
  }
  return { escalate: findings.length > 0, findings }
}

export function evaluateCompletionGate(plan, verificationResults) {
  const resultsByKey = new Map(verificationResults.map((r) => [r.key, r.result.status]))
  const missing = []
  plan.tasks.forEach((task, index) => {
    const key = `todo:${index + 1}`
    if (resultsByKey.get(key) !== "passed") missing.push({ key, title: task.title })
  })
  plan.finalVerification.forEach((f, index) => {
    const key = `final-wave:f${index + 1}`
    if (resultsByKey.get(key) !== "passed") missing.push({ key, title: f.text })
  })
  const allTasksDone = plan.tasks.every((t) => t.status === "completed")
  return {
    complete: missing.length === 0 && allTasksDone,
    phase: missing.length === 0 && allTasksDone ? "verifying" : "incomplete",
    missing,
    tasksDone: allTasksDone,
  }
}
