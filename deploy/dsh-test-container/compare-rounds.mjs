#!/usr/bin/env node
// Compare two eval rounds (summary.json) for reproducibility: per-scenario
// call counts within tolerance, aggregate totals, gate parity.
// usage: node compare-rounds.mjs <summaryA> <summaryB> [tolerance]
import { readFileSync } from 'node:fs'

const [aFile, bFile, toleranceArg = '2'] = process.argv.slice(2)
if (!aFile || !bFile) {
  console.error('usage: node compare-rounds.mjs <summaryA.json> <summaryB.json> [callTolerance]')
  process.exit(2)
}
const tolerance = Number(toleranceArg)
const a = JSON.parse(readFileSync(aFile, 'utf8'))
const b = JSON.parse(readFileSync(bFile, 'utf8'))
const byId = new Map(b.map((r) => [r.id, r]))

const rows = []
let within = 0
let totalA = 0
let totalB = 0
let rolesA = 0
let rolesB = 0
for (const ra of a) {
  const rb = byId.get(ra.id)
  if (!rb) { rows.push({ scenario: ra.id, note: 'missing in B' }); continue }
  totalA += ra.toolCalls
  totalB += rb.toolCalls
  rolesA += ra.roleEvents.length
  rolesB += rb.roleEvents.length
  const delta = Math.abs(ra.toolCalls - rb.toolCalls)
  const ok = delta <= tolerance
  if (ok) within += 1
  rows.push({
    scenario: ra.id,
    callsA: ra.toolCalls,
    callsB: rb.toolCalls,
    delta,
    withinTolerance: ok,
    rolesA: ra.roleEvents.length,
    rolesB: rb.roleEvents.length,
    secondsA: ra.seconds,
    secondsB: rb.seconds,
  })
}
console.log(JSON.stringify({
  scenarios: rows.length,
  withinTolerance: within,
  callTotals: { A: totalA, B: totalB },
  roleEvents: { A: rolesA, B: rolesB },
  rows,
}, null, 1))
