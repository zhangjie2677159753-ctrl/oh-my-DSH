#!/usr/bin/env node
// Compare every completed OMO replay session against its DSH counterpart and
// classify each finding. usage: node compare-batch.mjs [map.json] [dshevidence-dir] [out.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const [mapFile = '/tmp/omo-replay/map.json', dshDir = '/tmp/omo-eval-ocg', outFile = '/tmp/omo-replay/comparison.json'] = process.argv.slice(2)
const { normalizeDshEvidence, normalizeOmoParts, compareEvidence } = await import(join(here, 'evidence.mjs'))

const map = JSON.parse(readFileSync(mapFile, 'utf8'))
const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`
const db = new DatabaseSync(dbPath, { readOnly: true })

const rows = []
for (const entry of map) {
  const id = entry.scenario
  const dshFile = join(dshDir, id, 'session.jsonl')
  let dsh = null
  try {
    const lines = readFileSync(dshFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    dsh = normalizeDshEvidence(lines)
  } catch { /* missing DSH evidence */ }

  let omo = null
  try {
    const partRows = db.prepare(`SELECT m.data AS md, p.data AS pd FROM part p JOIN message m ON p.message_id = m.id
      WHERE p.session_id = ? ORDER BY p.time_created`).all(entry.sessionId)
    const byMessage = []
    let current = null
    for (const row of partRows) {
      const md = JSON.parse(row.md)
      const pd = JSON.parse(row.pd)
      if (!current || current.role !== (md.role ?? 'unknown') || md.time !== current.timeKey) {
        current = { role: md.role ?? 'unknown', timeKey: md.time, parts: [] }
        byMessage.push(current)
      }
      current.parts.push(pd)
    }
    omo = normalizeOmoParts(byMessage)
  } catch (error) {
    omo = { ok: false, errors: [String(error)] }
  }

  if (omo.ok && dsh?.ok) {
    const result = compareEvidence(omo.evidence, dsh.evidence)
    rows.push({
      scenario: id,
      omoTools: omo.evidence.toolSequence.map((t) => t.name),
      dshTools: dsh.evidence.toolSequence.map((t) => t.name),
      omoTurns: omo.evidence.assistantTurnCount,
      dshTurns: dsh.evidence.assistantTurnCount,
      comparison: result,
    })
  } else {
    rows.push({ scenario: id, omoOk: omo.ok, dshOk: dsh?.ok, omoErrors: omo.errors, note: 'one side unavailable' })
  }
}
db.close()
writeFileSync(outFile, JSON.stringify(rows, null, 1))
const pass = rows.filter((r) => r.comparison?.pass).length
const breaks = rows.filter((r) => (r.comparison?.parityBreaks ?? 0) > 0).length
console.log(`compared ${rows.length} scenarios: ${pass} machine-pass, ${breaks} with parity-breaks -> ${outFile}`)
