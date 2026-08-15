// omo-dsh Plan IR (OMO-1201..1203), pure part.
// OmoPlanV1: object-rooted schema with ids, dependencies, acceptance and a
// mandatory Final Verification Wave. The deterministic renderer emits the
// exact Boulder checklist grammar (## TODOs + ## Final Verification Wave)
// so rendered plans round-trip through parsePlanChecklist.
import { sha256 } from "../compat/prompt.mjs"
import { parsePlanChecklist } from "../boulder/plan-checklist.mjs"

export function validateOmoPlanV1(plan) {
  const errors = []
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) return ["plan: expected object"]
  if (plan.schemaVersion !== 1) errors.push("schemaVersion: expected 1")
  if (typeof plan.planId !== "string" || plan.planId.length === 0) errors.push("planId: required")
  if (!Number.isInteger(plan.revision) || plan.revision < 1) errors.push("revision: expected positive integer")
  if (typeof plan.title !== "string" || plan.title.length === 0) errors.push("title: required")
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    errors.push("tasks: expected non-empty array")
    return errors
  }
  const ids = new Set()
  plan.tasks.forEach((task, index) => {
    const path = `tasks[${index}]`
    if (typeof task.id !== "string" || task.id.length === 0) errors.push(`${path}.id: required`)
    else if (ids.has(task.id)) errors.push(`${path}.id: duplicate ${task.id}`)
    else ids.add(task.id)
    if (typeof task.title !== "string" || task.title.length === 0) errors.push(`${path}.title: required`)
    if (!["pending", "completed"].includes(task.status)) errors.push(`${path}.status: expected pending|completed`)
    if (task.dependencies !== undefined && (!Array.isArray(task.dependencies) || task.dependencies.some((d) => typeof d !== "string"))) {
      errors.push(`${path}.dependencies: expected string[]`)
    } else if (task.dependencies !== undefined) {
      for (const dep of task.dependencies) {
        if (!ids.has(dep) && dep !== task.id) errors.push(`${path}.dependencies: unknown ${dep}`)
        if (dep === task.id) errors.push(`${path}.dependencies: self-dependency ${dep}`)
      }
    }
    if (!Array.isArray(task.acceptance) || task.acceptance.length === 0) {
      errors.push(`${path}.acceptance: required non-empty array`)
    }
  })
  // dependency cycles
  const visiting = new Set()
  const done = new Set()
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const visit = (id) => {
    if (done.has(id)) return
    if (visiting.has(id)) { errors.push(`dependency cycle involving ${id}`); return }
    visiting.add(id)
    for (const dep of byId.get(id).dependencies ?? []) if (byId.has(dep)) visit(dep)
    visiting.delete(id)
    done.add(id)
  }
  for (const task of plan.tasks) visit(task.id)

  if (!Array.isArray(plan.finalVerification) || plan.finalVerification.length === 0) {
    errors.push("finalVerification: required non-empty array (Final Verification Wave is mandatory)")
  } else {
    plan.finalVerification.forEach((f, i) => {
      if (typeof f.text !== "string" || f.text.length === 0) errors.push(`finalVerification[${i}].text: required`)
    })
  }
  return errors
}

/** Deterministic Boulder-grammar renderer; IR → Markdown round-trips. */
export function renderPlanMarkdown(plan) {
  const errors = validateOmoPlanV1(plan)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  const lines = ["## TODOs"]
  plan.tasks.forEach((task, index) => {
    const box = task.status === "completed" ? "[x]" : "[ ]"
    lines.push(`- ${box} ${index + 1}. ${task.title}`)
  })
  lines.push("", "## Final Verification Wave")
  plan.finalVerification.forEach((f, index) => {
    const box = f.status === "completed" ? "[x]" : "[ ]"
    lines.push(`- ${box} F${index + 1}. ${f.text}`)
  })
  return lines.join("\n") + "\n"
}

/** Map rendered checkbox states back onto the IR (round-trip). */
export function applyProgress(plan, markdown) {
  const checklist = parsePlanChecklist(markdown)
  const next = structuredClone(plan)
  for (const entry of checklist.todos) {
    const index = Number(entry.key.split(":")[1]) - 1
    if (next.tasks[index]) next.tasks[index].status = entry.checked ? "completed" : "pending"
  }
  for (const entry of checklist.finalWave) {
    const index = Number(entry.key.split("f")[1]) - 1
    if (next.finalVerification[index]) next.finalVerification[index].status = entry.checked ? "completed" : "pending"
  }
  return next
}

export function planDigest(plan) {
  return sha256(JSON.stringify(plan))
}

export function samplePlan() {
  return {
    schemaVersion: 1,
    planId: "plan-1",
    revision: 1,
    title: "Sample plan",
    tasks: [
      { id: "t1", title: "First task", status: "pending", dependencies: [], acceptance: ["test passes"] },
      { id: "t2", title: "Second task", status: "pending", dependencies: ["t1"], acceptance: ["lint clean"] },
    ],
    finalVerification: [{ text: "Run full suite", status: "pending" }],
  }
}
