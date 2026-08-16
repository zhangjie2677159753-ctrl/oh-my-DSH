#!/usr/bin/env node
// Rebuild the eval summary from per-scenario evidence dirs, deterministically.
// Each scenario dir holds session.jsonl + transcript.txt; seconds is
// approximated from the mtime delta (transcript.txt starts when the run
// starts, session.jsonl lands at the end) and marked approximate. This
// recovers cleanly from interleaved/corrupted summary.json writes by
// concurrent runs (documented race in run-eval.sh usage).
// usage: node rebuild-summary.mjs [eval-dir] [output-summary.json]
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const [evalDir = "/tmp/omo-eval", outFile = join(evalDir, "summary.json")] = process.argv.slice(2)

// Salvage id->seconds from a possibly-corrupt previous summary.json:
// each row is written on its own line, so per-line JSON.parse recovers the
// seconds recorded by run-eval.sh even when the array framing is broken.
function salvageSeconds(existing) {
  const map = new Map()
  if (!existsSync(existing)) return map
  for (const line of readFileSync(existing, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed === "[" || trimmed === "]" || trimmed === ",") continue
    try {
      const row = JSON.parse(trimmed.replace(/[,\]]+$/, ""))
      if (row && typeof row.id === "string" && typeof row.seconds === "number") map.set(row.id, row.seconds)
    } catch { /* corrupt line; the per-dir reparse owns the row */ }
  }
  return map
}
const salvaged = salvageSeconds(join(evalDir, "summary.json"))

const rows = []
const warnings = []
for (const dir of readdirSync(evalDir).sort()) {
  const sessionFile = join(evalDir, dir, "session.jsonl")
  const transcriptFile = join(evalDir, dir, "transcript.txt")
  if (!existsSync(sessionFile) || !existsSync(transcriptFile)) continue
  let seconds = salvaged.get(dir) ?? null
  if (seconds === null) {
    try {
      const t0 = statSync(transcriptFile).mtimeMs
      const t1 = statSync(sessionFile).mtimeMs
      seconds = Math.max(0, Math.round((t1 - t0) / 1000))
      warnings.push(`${dir}: seconds approximated from mtime`)
    } catch {
      seconds = 0
      warnings.push(`${dir}: mtime unreadable; seconds=0`)
    }
  }
  const raw = execFileSync(process.execPath, [join(here, "parse-evidence.mjs"), sessionFile, transcriptFile, dir, String(seconds)], { encoding: "utf8" })
  rows.push(JSON.parse(raw))
}

if (rows.length === 0) {
  console.error(`no scenario dirs with session.jsonl+transcript.txt under ${evalDir}`)
  process.exit(2)
}
writeFileSync(outFile, JSON.stringify(rows, null, 1) + "\n")
console.log(`summary rebuilt: ${rows.length} rows -> ${outFile}`)
for (const w of warnings) console.log(`warn: ${w}`)
