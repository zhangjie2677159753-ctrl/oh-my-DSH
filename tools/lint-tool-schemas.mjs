#!/usr/bin/env node
// Scan a package source tree for illegal tool-parameter schema types.
// Usage: node tools/lint-tool-schemas.mjs [root]   (default: packages/omo-dsh/src)
// Exits 1 when any violation is found. Grep-equivalent for the DSH schema discipline:
// `type: 'json'` / `type: "text"` inside parameters 400 every turn.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { scanSourceText } from "../packages/omo-dsh/src/tools/schema-linter.mjs"

const here = fileURLToPath(new URL(".", import.meta.url))
const root = resolve(process.argv[2] ?? join(here, "..", "packages/omo-dsh/src"))

const files = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (entry.isFile() && /\.(ts|mts|js|mjs|json)$/.test(entry.name)) files.push(p)
  }
}
walk(root)

let total = 0
for (const file of files) {
  const text = readFileSync(file, "utf8")
  const violations = scanSourceText(text)
  for (const v of violations) {
    total++
    console.error(`${file}:${v.line}: ${v.error}`)
  }
}
if (total > 0) {
  console.error(`lint-tool-schemas: ${total} illegal type literal(s)`)
  process.exit(1)
}
console.log(`lint-tool-schemas: OK (${files.length} files scanned)`)
