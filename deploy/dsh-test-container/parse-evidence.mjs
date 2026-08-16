#!/usr/bin/env node
// Parse one eval scenario's session log + transcript into a summary row.
// usage: node parse-evidence.mjs <session.jsonl> <transcript.txt> <id> <seconds>
// transcriptTail source: stdout transcript when non-empty, else the last
// assistant/message text parts from the session log (timed-out runs often
// produce an empty stdout transcript but a complete session log).
import { readFileSync } from 'node:fs'

const [,, sessionFile, transcriptFile, id, seconds] = process.argv
if (!sessionFile || !transcriptFile || !id) {
  console.error('usage: parse-evidence.mjs <session.jsonl> <transcript.txt> <id> <seconds>')
  process.exit(2)
}

function textFromParts(content) {
  const texts = []
  for (const part of content ?? []) {
    if (part.type === 'text' && part.text) texts.push(part.text)
    else if (part.type === 'reasoning' && part.text) texts.push(`[reasoning] ${part.text}`)
    else if (part.type === 'tool-call' && part.name) {
      texts.push(`[tool-call ${part.name} ${String(part.arguments ?? '').slice(0, 120)}]`)
    }
  }
  return texts.join('\n')
}

const lines = readFileSync(sessionFile, 'utf8').split('\n').filter(Boolean)
const calls = []
const roleEvents = []
let assistantTurns = 0
let lastAssistantText = ''
for (const line of lines) {
  try {
    const ev = JSON.parse(line)
    if (ev.type === 'tool/call') calls.push(ev.data?.name)
    if (ev.type === 'omo/role') roleEvents.push(ev.data)
    if (ev.type === 'assistant/message') {
      assistantTurns += 1
      const text = textFromParts(ev.data?.message?.content)
      if (text.length > 0) lastAssistantText = text
    }
  } catch { /* partial line */ }
}
const transcript = readFileSync(transcriptFile, 'utf8').trim()
const fromLog = transcript.length === 0 && lastAssistantText.length > 0
const tailText = fromLog ? lastAssistantText : transcript
console.log(JSON.stringify({
  id,
  seconds: Number(seconds ?? 0),
  toolCalls: calls.length,
  toolNames: [...new Set(calls)],
  roleEvents,
  assistantTurns,
  transcriptLength: tailText.length,
  transcriptTail: tailText.slice(-200),
  transcriptSource: fromLog ? 'session-log' : 'stdout',
}))
