#!/usr/bin/env node
// Live eval status: summarizes every completed scenario dir under the eval
// output plus the machine hard gates, for round-to-round observation.
// usage: node eval-status.mjs [eval-dir]
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [evalDir = '/tmp/omo-eval'] = process.argv.slice(2)

const ids = readdirSync(evalDir).filter((d) => /^E2E-\d+$/.test(d) && existsSync(join(evalDir, d, 'session.jsonl'))).sort()
console.log(`completed: ${ids.length}`)
console.log('')
console.log('| 场景 | 调用 | 角色事件 | 回合 | 时长(s) | 工具 |')
console.log('|---|---|---|---|---|---|')
for (const id of ids) {
  const raw = execFileSync(process.execPath, [join(here, 'parse-evidence.mjs'), join(evalDir, id, 'session.jsonl'), join(evalDir, id, 'transcript.txt'), id, '0'], { encoding: 'utf8' })
  const row = JSON.parse(raw)
  console.log(`| ${row.id} | ${row.toolCalls} | ${row.roleEvents.length} | ${row.assistantTurns} | ${row.seconds} | ${(row.toolNames ?? []).join(', ') || '—'} |`)
}
console.log('')
try {
  const gates = execFileSync(process.execPath, [join(here, '..', '..', 'tools', 'check-hard-gates.mjs'), evalDir], { encoding: 'utf8' })
  console.log(gates.trim())
} catch (err) {
  console.log(`hard gates: ${err.message}`)
}
