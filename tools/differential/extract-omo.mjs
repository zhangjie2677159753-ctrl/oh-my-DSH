#!/usr/bin/env node
// Extract normalized OMO-side evidence for one OpenCode session from the
// local opencode.db (CLI 1.15.13 format: message.data.role + part.data).
// usage: node extract-omo.mjs <sessionId> [dbPath]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const [sessionId, dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`] = process.argv.slice(2)
if (!sessionId) {
  console.error('usage: node extract-omo.mjs <sessionId> [dbPath]')
  process.exit(2)
}
const db = new DatabaseSync(dbPath, { readOnly: true })
const messages = db.prepare(`SELECT m.data AS md, p.data AS pd, p.time_created AS t
  FROM part p JOIN message m ON p.message_id = m.id
  WHERE p.session_id = ? ORDER BY p.time_created`).all(sessionId)
const byMessage = []
let current = null
for (const row of messages) {
  const md = JSON.parse(row.md)
  const pd = JSON.parse(row.pd)
  const role = md.role ?? 'unknown'
  if (!current || current.role !== role || md.time !== current.timeKey) {
    current = { role, timeKey: md.time, parts: [] }
    byMessage.push(current)
  }
  current.parts.push(pd)
}
db.close()
const mod = await import(join(here, 'evidence.mjs'))
const result = mod.normalizeOmoParts(byMessage)
console.log(JSON.stringify(result, null, 1))
