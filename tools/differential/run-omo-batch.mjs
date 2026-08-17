#!/usr/bin/env node
// Batch-run the E2E scenarios on the OMO side (OpenCode CLI + fixed-SHA
// plugin + opencode-go route). Each run creates one session; the newest
// session id after each run is mapped to the scenario.
// usage: node run-omo-batch.mjs [outMap] [maxScenarios]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const [outMap = '/tmp/omo-replay/map.json', maxScenarios = '17'] = process.argv.slice(2)
const outDir = dirname(outMap)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// opencode-go key: read from the host credential store, never logged.
const credsText = readFileSync(`${process.env.HOME}/.dsh/.credentials.yaml`, 'utf8')
const creds = {}
for (const line of credsText.split('\n')) {
  const m = line.match(/^(\S+):\s*(.*)$/)
  if (m) creds[m[1]] = m[2]
}
const key = creds.OPENCODE_GO_API_KEY
if (!key) {
  console.error('OPENCODE_GO_API_KEY missing from credential store')
  process.exit(2)
}

const prompts = JSON.parse(readFileSync(join(root, 'docs/plans/eval-prompts.json'), 'utf8')).prompts
const ids = Object.keys(prompts).filter((id) => /^E2E-\d+$/.test(id)).sort().slice(0, Number(maxScenarios))
const workdir = process.env.OMO_REPLAY_CWD ?? '/tmp/omo-g4'
const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`

const map = []
for (const id of ids) {
  const prompt = prompts[id]
  console.log(`== ${id} ==`)
  const before = Date.now()
  let output = ''
  try {
    output = execFileSync('opencode', ['run', prompt], {
      cwd: workdir,
      encoding: 'utf8',
      timeout: 900_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, OPENCODE_GO_API_KEY: key },
    })
  } catch (error) {
    output = `(run error: ${error.message}) ${String(error.stdout ?? '').slice(0, 300)}`
  }
  // newest session id = this run's session
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare('SELECT id, title FROM session ORDER BY time_created DESC LIMIT 1').get()
  db.close()
  map.push({ scenario: id, sessionId: row.id, title: row.title, seconds: Math.round((Date.now() - before) / 1000), outputTail: output.slice(-200) })
  writeFileSync(outMap, JSON.stringify(map, null, 1))
  console.log(`  session=${row.id} seconds=${map[map.length - 1].seconds} tail=${output.slice(-120).replace(/\n/g, ' ')}`)
}
console.log(`batch done: ${map.length} scenarios -> ${outMap}`)
