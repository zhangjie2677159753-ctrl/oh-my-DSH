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

// Documented OMO OpenCode -> DSH tool-name equivalence (the migration's
// vocabulary mapping; the target harness's names are canonical).
const OMO_DSH_TOOL_EQUIVALENCE = {
  read: 'read',
  glob: 'glob',
  grep: 'grep',
  bash: 'bash',
  shell: 'bash',
  write: 'write',
  edit: 'edit',
  patch: 'edit',
  str_replace_editor: 'str_replace_editor',
  todowrite: 'todo_write',
  todoread: 'todo_write',
  todo_write: 'todo_write',
  question: 'ask_user_question',
  ask_user_question: 'ask_user_question',
  webfetch: 'web_fetch',
  webfetch_clean: 'web_fetch',
  web_search: 'web_search',
  task: 'subagent',
  call_omo_agent: 'subagent',
  plan: 'create_goal',
  create_plan: 'create_goal',
  update_plan: 'update_goal',
  get_goal: 'get_goal',
  update_goal: 'update_goal',
  create_goal: 'create_goal',
  omo_role: 'omo_role',
  omo_role_status: 'omo_role_status',
  interactive_bash: 'terminal_open',
  terminal_open: 'terminal_open',
}
const dbPath = process.env.OMO_OPENCODE_DB ?? `${process.env.HOME}/.local/share/opencode/opencode.db`
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
    const result = compareEvidence(omo.evidence, dsh.evidence, { toolEquivalence: OMO_DSH_TOOL_EQUIVALENCE })
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
