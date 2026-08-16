#!/usr/bin/env node
// E30 payload contract verifier (OMO-3002 adapted to the preset artifact).
// Verifies the OMO preset payload against deploy/payload-manifest.json:
// - preset root: exact allowlist (every listed file must exist, no extras)
// - src root: digest-pinned (new/removed/changed files drift the digest set)
// - required entry points exist and .mjs files pass `node --check` (syntax)
// - denylist patterns match nothing in the payload (secrets structurally
//   impossible: .env, *.key, *.pem, node_modules, .git)
// usage: node tools/verify-preset-payload.mjs [--check]
//   --check: write digests to the manifest; exit 1 when they drifted
// exit code 0 = gate passes; non-zero = payload drift (fail closed)
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const manifestPath = join(root, "deploy", "payload-manifest.json")
const checkMode = process.argv.includes("--check")

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
if (manifest.schemaVersion !== 1 || manifest.mode !== "allowlist-exact") {
  console.error("payload manifest: schemaVersion/mode mismatch")
  process.exit(2)
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const errors = []
const files = [] // [abs, rel]

// preset root: exact allowlist
{
  const dir = join(root, manifest.roots.preset)
  const actual = walk(dir).map((p) => relative(dir, p)).sort()
  const declared = [...(manifest.presetFiles ?? [])].sort()
  for (const f of declared.filter((f) => !actual.includes(f))) errors.push(`preset: declared file missing: ${f}`)
  for (const f of actual.filter((f) => !declared.includes(f))) errors.push(`preset: undeclared file in payload: ${f}`)
  for (const rel of actual) files.push([join(dir, rel), join(manifest.roots.preset, rel)])
}

// src root: digest-pinned (accept all, drift caught by digests)
{
  const dir = join(root, manifest.roots.src)
  for (const rel of walk(dir).map((p) => relative(dir, p)).sort()) {
    files.push([join(dir, rel), join(manifest.roots.src, rel)])
  }
}

// required entry points
for (const ep of manifest.requiredEntryPoints) {
  const p = join(root, ep)
  try {
    statSync(p)
    if (ep.endsWith(".mjs")) execFileSync(process.execPath, ["--check", p], { stdio: "pipe" })
  } catch (err) {
    errors.push(`entry point ${ep}: ${err.message}`)
  }
}

// denylist structural check
function matchDeny(name) {
  return manifest.denylist.some((pattern) => {
    if (pattern.startsWith("*.")) return name.endsWith(pattern.slice(1))
    return name === pattern || name.includes(pattern)
  })
}
for (const [, rel] of files) {
  const segments = rel.split("/")
  if (segments.some(matchDeny)) errors.push(`denylist hit: ${rel}`)
}

// digests
const digests = {}
for (const [abs, rel] of files) {
  digests[rel] = createHash("sha256").update(readFileSync(abs)).digest("hex")
}
const drift = JSON.stringify(manifest.digests ?? {}) !== JSON.stringify(digests)

if (checkMode) {
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, digests }, null, 2) + "\n")
  if (drift) {
    console.error("payload digests drifted; manifest updated — re-run to confirm gate")
    process.exit(1)
  }
  console.log("payload digest manifest up to date")
  process.exit(errors.length === 0 ? 0 : 1)
}

if (errors.length > 0) {
  for (const e of errors) console.error(`payload gate FAIL: ${e}`)
  process.exit(1)
}
console.log(`payload gate OK: ${files.length} files verified, digests ${drift ? "DRIFTED (run --check)" : "pinned"}`)
process.exit(drift ? 1 : 0)
