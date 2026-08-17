#!/usr/bin/env node
// C1-C3 synthetic usage driver: posts a diverse scenario batch to the demo
// /chat endpoint; the demo's instrumentation records every session for the
// canary evidence base. Agent-conducted (labeled in the canary plan).
// usage: node canary-batch.mjs [count] [baseUrl]
import { execFileSync } from 'node:child_process'

const [countArg = '30', baseUrl = 'http://127.0.0.1:3200'] = process.argv.slice(2)
const count = Number(countArg)

const SCENARIOS = [
  "Call omo_role_status. Then stop.",
  "Call omo_role role=prometheus reason=canary. Then call omo_boulder_role. Then stop.",
  "Call omo_role role=hephaestus reason=canary. Then call omo_role_status. Then stop.",
  "Call omo_memory_write with scope='session' and content='canary note N' and consent=true. Then call omo_memory_read. Then stop.",
  "Call omo_monitor_status. Then call omo_boulder_role. Then stop.",
  "Call omo_team_status with workflow='default' and members=['a','b']. Then stop.",
  "Call omo_openclaw_status with message='plain text no secrets'. Then stop.",
  "Create a todo with one item 'canary task', then call omo_role_status. Then stop.",
  "Call omo_boulder_role, then omo_role role=atlas reason=canary, then omo_boulder_role. Then stop.",
  "Call omo_role_status and report which OMO role currently owns planning authority. Then stop.",
]

let done = 0
for (let i = 0; i < count; i++) {
  const message = SCENARIOS[i % SCENARIOS.length].replace('N', String(i))
  try {
    execFileSync('curl', ['-s', '-m', '620', '-X', 'POST', `${baseUrl}/chat`, '-H', 'content-type: application/json', '-d', JSON.stringify({ message })], { stdio: 'ignore', timeout: 640_000 })
    done += 1
  } catch {
    // busy/timeout: skip, the session may still have run
  }
  console.log(`canary batch: ${done}/${count}`)
}
console.log(`batch done: ${done} sessions attempted`)
