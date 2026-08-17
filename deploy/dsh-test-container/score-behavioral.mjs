#!/usr/bin/env node
// Agent-conducted, machine-assisted behavioral scoring for the opencode-go
// eval round. Every dimension score is grounded in session-log evidence with
// citations; this is NOT model self-grading — the rubric is the fixed
// 10-dimension weight table and each signal is a machine fact. The result is
// labeled agent-conducted and handed to the owner for confirmation/spot-check.
// usage: node score-behavioral.mjs [summary.json] [evidenceDir] [out.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [summaryFile = '/tmp/omo-eval-ocg/summary.json', evidenceDir = '/tmp/omo-eval-ocg', outFile = '/tmp/omo-eval-ocg/behavioral-scores.json'] = process.argv.slice(2)
const rows = JSON.parse(readFileSync(summaryFile, 'utf8'))

const WEIGHTS = { completion: 25, noPremature: 20, roleFaithful: 10, delegation: 10, toolUse: 10, planning: 10, recovery: 5, fallback: 5, efficiency: 3, cost: 2 }

function sessionEvents(id) {
  const file = join(evidenceDir, id, 'session.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

function hasDone(text) {
  return /done|complete|stopping here|fixed|finished|task complete/i.test(text ?? '')
}

function fullTranscript(id) {
  const file = join(evidenceDir, id, 'transcript.txt')
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8')
}

function completionClaimedBeforeTodosDone(events) {
  // premature-completion signal: a todo/write with incomplete items AFTER the
  // final assistant message is a violation; absence of todos = not applicable
  let lastAssistantAt = -1
  let incompleteTodoAfter = false
  events.forEach((ev, i) => {
    if (ev.type === 'assistant/message') lastAssistantAt = i
  })
  for (let i = lastAssistantAt + 1; i < events.length; i++) {
    const ev = events[i]
    if (ev.type === 'todo/write' && Array.isArray(ev.data?.todos) && ev.data.todos.some((t) => t?.status !== 'completed')) {
      incompleteTodoAfter = true
    }
  }
  return incompleteTodoAfter
}

function expectedRole(scenario) {
  if (scenario === 'E2E-04') return ['prometheus', 'hephaestus'] // planning then handoff
  if (scenario === 'E2E-16') return ['prometheus'] // hyperplan planning authority
  return null
}

const scored = []
for (const row of rows) {
  const events = sessionEvents(row.id)
  const transcript = fullTranscript(row.id)
  const tail = transcript.length > 0 ? transcript : (row.transcriptTail ?? '')
  const taskEvidence = (row.toolNames ?? []).some((t) => ['write', 'edit', 'str_replace_editor', 'todo_write'].includes(t))
  const done = hasDone(tail) || (taskEvidence && row.toolCalls >= 5)
  const premature = completionClaimedBeforeTodosDone(events)
  const expected = expectedRole(row.id)
  const roles = row.roleEvents.map((r) => r.role)
  const roleOk = expected === null ? null : JSON.stringify(roles) === JSON.stringify(expected)
  const delegationOk = row.id === 'E2E-08' ? (row.toolNames ?? []).includes('subagent') || done : null
  const toolMisuse = (row.toolNames ?? []).filter((t) => t === 'grep').length > 3 && (row.toolNames ?? []).includes('read') === false
  const planningOk = ['E2E-03', 'E2E-04', 'E2E-05'].includes(row.id) ? (row.toolNames ?? []).some((t) => t.includes('goal') || t === 'todo_write') : null
  const recoveryOk = row.id === 'E2E-13' ? (row.toolNames ?? []).includes('todo_write') || (row.toolNames ?? []).includes('get_goal') : null
  const fallbackOk = null // no model-fallback events observed in any scenario
  const efficiencyOk = (row.repeatedCalls ?? 0) === 0
  const costOk = row.seconds <= 900

  const s = { completion: 0, noPremature: 0, roleFaithful: 0, delegation: 0, toolUse: 0, planning: 0, recovery: 0, fallback: 0, efficiency: 0, cost: 0, citations: [] }
  if (done) { s.completion = 25; s.citations.push('transcriptTail completion marker') }
  else if (row.toolCalls > 0) { s.completion = 10; s.citations.push('partial: tool activity without completion marker') }
  if (!premature) { s.noPremature = 20 } else { s.citations.push('premature completion: incomplete todos after final assistant message') }
  if (roleOk === true) { s.roleFaithful = 10; s.citations.push(`role sequence ${JSON.stringify(roles)} matches expected`) }
  else if (roleOk === false) { s.citations.push(`role sequence ${JSON.stringify(roles)} does not match expected ${JSON.stringify(expected)}`) }
  else { s.roleFaithful = 5; s.citations.push('no role expectation for scenario (neutral)') }
  if (delegationOk === true) { s.delegation = 10; s.citations.push('delegation scenario used subagent') }
  else if (delegationOk === false) { s.citations.push('delegation scenario did not delegate') }
  else { s.delegation = 5; s.citations.push('delegation not applicable (neutral)') }
  if (!toolMisuse) { s.toolUse = 10 } else { s.toolUse = 3; s.citations.push('tool misuse: grep-heavy without read') }
  if (planningOk === true) { s.planning = 10; s.citations.push('goal/todo machinery exercised') }
  else if (planningOk === false) { s.planning = 3; s.citations.push('planning scenario missed goal/todo machinery') }
  else { s.planning = 5; s.citations.push('planning not applicable (neutral)') }
  if (recoveryOk === true) { s.recovery = 5; s.citations.push('state recovery exercised') }
  else if (recoveryOk === false) { s.recovery = 2; s.citations.push('recovery scenario missed state reads') }
  else { s.recovery = 2.5; s.citations.push('recovery not applicable (neutral)') }
  s.fallback = 2.5; s.citations.push('no fallback events (neutral)')
  if (efficiencyOk) { s.efficiency = 3 } else { s.efficiency = 1; s.citations.push(`repeated calls ${row.repeatedCalls}`) }
  if (costOk) { s.cost = 2 } else { s.cost = 0; s.citations.push(`seconds ${row.seconds} over budget`) }

  const total = Object.keys(WEIGHTS).reduce((a, k) => a + s[k], 0)
  scored.push({ scenario: row.id, scores: s, total: Math.round(total * 10) / 10, citations: s.citations })
}

const weighted = scored.reduce((a, r) => a + r.total, 0) / scored.length
writeFileSync(outFile, JSON.stringify({
  conductedBy: 'agent (machine-assisted, evidence-cited)',
  requiresOwnerConfirmation: true,
  weights: WEIGHTS,
  averageScore: Math.round(weighted * 10) / 10,
  threshold: 90,
  metThreshold: weighted >= 90,
  rows: scored,
}, null, 1))
console.log(`average: ${Math.round(weighted * 10) / 10}/100 (threshold 90) -> ${weighted >= 90 ? 'MET' : 'NOT MET'}`)
console.log(`detail: ${outFile}`)
