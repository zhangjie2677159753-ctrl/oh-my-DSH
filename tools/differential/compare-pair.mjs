#!/usr/bin/env node
// Compare one OMO session against one DSH eval scenario.
// usage: node compare-pair.mjs <omo-session-id> <dsh-session.jsonl> [label]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const [sessionId, dshFile, label = sessionId] = process.argv.slice(2)
if (!sessionId || !dshFile) {
  console.error('usage: node compare-pair.mjs <omo-session-id> <dsh-session.jsonl> [label]')
  process.exit(2)
}
const { normalizeDshEvidence, normalizeOmoParts, compareEvidence } = await import(join(here, 'evidence.mjs'))

// OMO side: extract parts from the local opencode db
const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`
const db = new DatabaseSync(dbPath, { readOnly: true })
const rows = db.prepare(`SELECT m.data AS md, p.data AS pd FROM part p JOIN message m ON p.message_id = m.id
  WHERE p.session_id = ? ORDER BY p.time_created`).all(sessionId)
db.close()
const byMessage = []
let current = null
for (const row of rows) {
  const md = JSON.parse(row.md)
  const pd = JSON.parse(row.pd)
  if (!current || current.role !== (md.role ?? 'unknown') || md.time !== current.timeKey) {
    current = { role: md.role ?? 'unknown', timeKey: md.time, parts: [] }
    byMessage.push(current)
  }
  current.parts.push(pd)
}
const omo = normalizeOmoParts(byMessage)
if (!omo.ok) {
  console.error('omo side failed:', omo.errors)
  process.exit(2)
}

// DSH side: session.jsonl
const lines = readFileSync(dshFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const dsh = normalizeDshEvidence(lines)
if (!dsh.ok) {
  console.error('dsh side failed:', dsh.errors)
  process.exit(2)
}

const result = compareEvidence(omo.evidence, dsh.evidence)
console.log(JSON.stringify({
  label,
  omoSession: sessionId,
  omoTools: omo.evidence.toolSequence.map((t) => t.name),
  dshTools: dsh.evidence.toolSequence.map((t) => t.name),
  omoTurns: omo.evidence.assistantTurnCount,
  dshTurns: dsh.evidence.assistantTurnCount,
  comparison: result,
}, null, 1))
