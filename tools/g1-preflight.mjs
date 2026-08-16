#!/usr/bin/env node
// G1 preflight for the Batch A vertical slice: everything that must hold
// BEFORE attempting a real DSH deployment mount, runnable with one command:
//   node tools/g1-preflight.mjs
// Real-mount execution remains a deployment gate (see
// packages/omo-dsh/agent-presets/omo/G1-DEPLOYMENT-CHECKLIST.md).
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { scanSourceText } from "../packages/omo-dsh/src/tools/schema-linter.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const pkg = join(root, "packages/omo-dsh")
const failures = []

function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures.push({ name, error: error.message })
    console.error(`FAIL  ${name}: ${error.message}`)
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && /\.(mjs|js|ts)$/.test(entry.name)) out.push(p)
  }
  return out
}

console.log("G1 preflight")

check("package skeleton exists", () => {
  for (const rel of ["package.json", "tsconfig.json", "src/index.ts", "src/compat", "agent-presets/omo", "bundle", "tests"]) {
    if (!existsSync(join(pkg, rel))) throw new Error(`missing ${rel}`)
  }
})

check("tool schema discipline holds across src", () => {
  const violations = []
  for (const file of walk(join(pkg, "src"))) {
    for (const v of scanSourceText(readFileSync(file, "utf8"))) {
      violations.push(`${file}:${v.line}: ${v.error}`)
    }
  }
  if (violations.length > 0) throw new Error(violations.join("; "))
})

check("compat capability seam loads and fails closed", async () => {
  const { probeReport } = await import("../packages/omo-dsh/src/compat/dsh-api.mjs")
  const report = probeReport([])
  if (report.ok) throw new Error("empty probe unexpectedly satisfied")
  if (report.missing.length !== 25) throw new Error(`expected 25 required capabilities, got ${report.missing.length}`)
})

check("config default validates", async () => {
  const { validateOmoDshConfig, defaultConfig } = await import("../packages/omo-dsh/src/config/schema-validator.mjs")
  const result = validateOmoDshConfig(defaultConfig())
  if (!result.ok) throw new Error(result.errors.join("; "))
})

check("unit suite passes (node --test)", () => {
  const out = execFileSync("node", ["--test", "tests/**/*.test.mjs"], { cwd: pkg, encoding: "utf8" })
  if (!/# fail 0/.test(out)) throw new Error("node --test reported failures")
})

check("hook inventory lock present with 56/58/4", () => {
  const lock = JSON.parse(readFileSync(join(root, "docs/plans/hook-inventory.lock.json"), "utf8"))
  if (lock.configurableCount !== 56) throw new Error(`configurable=${lock.configurableCount}`)
  if (lock.totalConstructed !== 58) throw new Error(`constructed=${lock.totalConstructed}`)
  if (lock.exceptions.length !== 4) throw new Error(`exceptions=${lock.exceptions.length}`)
})

check("omo config keys lock present with 46 top-level keys (E30 schema freshness)", () => {
  const keys = JSON.parse(readFileSync(join(root, "docs/upstream/omo-config-keys.json"), "utf8"))
  if (keys.counts?.topLevelKeys !== 46) throw new Error(`topLevelKeys=${keys.counts?.topLevelKeys}`)
  if (typeof keys.source !== "string" || !keys.source.includes("038ed0cbbefe2b40677b63867aeea0d16bc303e0")) {
    // pinned SHA missing from the lock source = upstream SHA moved;
    // locks must be regenerated + reviewed (fail closed, never auto-fix)
    throw new Error(`config-keys lock source drifted: ${keys.source}`)
  }
})

check("no secrets in production source", () => {
  // Test fixtures deliberately embed synthetic secret-shaped strings to
  // exercise the validator's fail-closed sniff; production code must be clean.
  const forbidden = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16})/
  for (const file of walk(join(pkg, "src"))) {
    if (forbidden.test(readFileSync(file, "utf8"))) throw new Error(`secret pattern in ${file}`)
  }
})

check("E30 payload contract gate passes (digests pinned, no drift)", () => {
  execFileSync(process.execPath, ["tools/verify-preset-payload.mjs"], { cwd: root, encoding: "utf8" })
})

check("E29/E31 drill scripts pass (migration + rollback state machines)", () => {
  execFileSync("bash", ["deploy/dsh-test-container/drill-migration.sh"], { cwd: root, encoding: "utf8" })
  execFileSync("bash", ["deploy/dsh-test-container/drill-rollback.sh"], { cwd: root, encoding: "utf8" })
})

check("G4 differential evidence layer passes (normalizers + comparison engine)", () => {
  const out = execFileSync(process.execPath, ["--test", "tools/differential/evidence.test.mjs"], { cwd: root, encoding: "utf8" })
  if (!/# fail 0/.test(out)) throw new Error("differential evidence tests failed")
})

if (failures.length > 0) {
  console.error(`G1 preflight FAILED with ${failures.length} failure(s)`)
  process.exit(1)
}
console.log("G1 preflight PASSED")
