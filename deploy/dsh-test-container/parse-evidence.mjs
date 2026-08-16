#!/usr/bin/env node
// Parse one eval scenario's session log + transcript into a summary row.
// usage: node parse-evidence.mjs <session.jsonl> <transcript.txt> <id> <seconds>
import { readFileSync } from 'node:fs'

const [,, sessionFile, transcriptFile, id, seconds] = process.argv
if (!sessionFile || !transcriptFile || !id) {
  console.error('usage: parse-evidence.mjs <session.jsonl> <transcript.txt> <id> <seconds>')
  process.exit(2)
}

const lines = readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean)
const calls = []
const roleEvents = []
let assistantTurns = 0
for (const line of lines) {
  try {
    const ev = JSON.parse(line)
    if (ev.type === 'tool/call') calls.push(ev.data?.name)
    if (ev.type === 'omo/role') roleEvents.push(ev.data)
    if (ev.type === 'assistant/message') assistantTurns += 1
  } catch { /* partial line */ }
}
const transcript = readFileSync(transcriptFile, 'utf8').trim()
console.log(JSON.stringify({
  id,
  seconds: Number(seconds ?? 0),
  toolCalls: calls.length,
  toolNames: [...new Set(calls)],
  roleEvents,
  assistantTurns,
  transcriptLength: transcript.length,
  transcriptTail: transcript.slice(-200),
}))
