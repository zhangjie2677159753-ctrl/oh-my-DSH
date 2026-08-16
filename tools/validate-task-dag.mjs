#!/usr/bin/env node
// Validate docs/plans/task-dag.json (PAR-GOV-004).
// Rule groups: [{tasks:[...], dependencies:[...]}]; dependencies apply to
// every task in the group. Enforces the validation config flags and the
// markdown drift check. exit 0 = valid; exit 1 = drift (fail closed).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dag = JSON.parse(readFileSync(join(root, 'docs', 'plans', 'task-dag.json'), 'utf8'))
const validation = dag.validation ?? {}

const errors = []
const ids = dag.taskIds
if (!Array.isArray(ids) || ids.length === 0) {
  console.error('task-dag: taskIds missing or empty')
  process.exit(1)
}

const seen = new Set()
for (const id of ids) {
  if (typeof id !== 'string' || id.length === 0) { errors.push(`invalid task id ${JSON.stringify(id)}`); continue }
  if (seen.has(id)) errors.push(`duplicate task id ${id}`)
  seen.add(id)
  if (/placeholder|TODO|XXX|TBD/i.test(id)) errors.push(`placeholder id ${id}`)
}

const rules = dag.dependencyRules ?? []
const occurrence = new Map()
const edges = []
if (validation.requireExplicitDependencies && rules.length === 0) {
  errors.push('dependencyRules: empty while requireExplicitDependencies is set')
}
function expandGroup(rule) {
  if (Array.isArray(rule?.tasks) && rule.tasks.length > 0) return rule.tasks
  if (typeof rule?.range === 'string') {
    const m = rule.range.match(/^(OMO-\d{4})\.\.(OMO-\d{4})$/)
    if (!m) return null
    const lo = Number(m[1].slice(4))
    const hi = Number(m[2].slice(4))
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) return null
    const out = []
    for (let n = lo; n <= hi; n++) out.push(`OMO-${String(n).padStart(4, '0')}`)
    return out
  }
  return null
}

for (const [index, rule] of rules.entries()) {
  const group = expandGroup(rule)
  const deps = rule?.dependencies ?? []
  if (group === null) { errors.push(`rule ${index}: tasks/range missing or malformed`); continue }
  for (const task of group) {
    if (!seen.has(task)) errors.push(`rule ${index}: unknown task ${task}`)
    occurrence.set(task, (occurrence.get(task) ?? 0) + 1)
    for (const dep of deps) {
      if (!seen.has(dep)) errors.push(`rule ${index}: task ${task} depends on unknown ${dep}`)
      else edges.push([dep, task])
    }
  }
}
for (const id of ids) {
  const count = occurrence.get(id) ?? 0
  if (count === 0) errors.push(`task ${id}: orphan (not covered by any rule group)`)
  if (count > 1) errors.push(`task ${id}: appears ${count} times (requireEveryTaskExactlyOnce)`)
}

const indegree = new Map(ids.map((id) => [id, 0]))
const adj = new Map(ids.map((id) => [id, []]))
for (const [from, to] of edges) {
  adj.get(from).push(to)
  indegree.set(to, indegree.get(to) + 1)
}
const queue = [...ids].filter((id) => indegree.get(id) === 0)
let visited = 0
while (queue.length > 0) {
  const id = queue.shift()
  visited += 1
  for (const next of adj.get(id)) {
    indegree.set(next, indegree.get(next) - 1)
    if (indegree.get(next) === 0) queue.push(next)
  }
}
if (visited !== ids.length) errors.push(`dependency graph has a cycle (visited ${visited}/${ids.length})`)

if (validation.driftCheckMarkdownTaskIds) {
  const md = readFileSync(join(root, 'docs', 'plans', 'MASTER-IMPLEMENTATION-PLAN.md'), 'utf8')
  const mdIds = [...md.matchAll(/(?:###\s+|Epic\s+)?(OMO-\d{4})/g)].map((m) => m[1])
  const mdSet = new Set(mdIds)
  const idsSet = new Set(ids)
  for (const id of ids) if (!mdSet.has(id)) errors.push(`task ${id}: missing from MASTER-IMPLEMENTATION-PLAN.md (drift)`)
  for (const id of mdSet) if (!idsSet.has(id)) errors.push(`markdown id ${id}: not in task-dag.json (drift)`)
}

if (errors.length > 0) {
  for (const e of errors) console.error(`task-dag FAIL: ${e}`)
  process.exit(1)
}
console.log(`task-dag OK: ${ids.length} ids, ${rules.length} rule groups, ${edges.length} dependency edges, acyclic, markdown in sync`)
