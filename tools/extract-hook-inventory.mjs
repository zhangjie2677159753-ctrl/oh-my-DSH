#!/usr/bin/env node
// Extract the OMO hook inventory from the fixed-SHA checkout.
// Usage: node tools/extract-hook-inventory.mjs <omo-checkout-root> [output-json]
// Exits non-zero when the configurable enum is not exactly the expected count
// or a composer file is missing, so CI can fail closed on drift.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [checkout, outPath = "docs/plans/hook-inventory.lock.json"] = process.argv.slice(2)
if (!checkout) {
  console.error("usage: node tools/extract-hook-inventory.mjs <omo-checkout-root> [output]")
  process.exit(2)
}

const root = join(checkout, "packages/omo-opencode/src")
const schemaPath = join(root, "config/schema/hooks.ts")
const schema = readFileSync(schemaPath, "utf8")
const enumBody = schema.slice(schema.indexOf("z.enum(["), schema.indexOf("])", schema.indexOf("z.enum([")))
const configurable = [...enumBody.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1])
const EXPECTED_CONFIGURABLE = 56

const composerFiles = [
  "plugin/hooks/create-session-hooks.ts",
  "plugin/hooks/create-tool-guard-hooks.ts",
  "plugin/hooks/create-transform-hooks.ts",
  "plugin/hooks/create-continuation-hooks.ts",
  "plugin/hooks/create-skill-hooks.ts",
]

function registeredNames(source) {
  const names = new Set()
  const re = /safe(?:Create)?Hook\(\s*["']([a-z0-9-]+)["']/g
  let m
  while ((m = re.exec(source))) names.add(m[1])
  return [...names].sort()
}

const constructed = {}
let totalConstructed = 0
for (const rel of composerFiles) {
  const source = readFileSync(join(root, rel), "utf8")
  const composer = rel.split("/").pop().replace(".ts", "")
  const names = registeredNames(source)
  // transform composer additionally builds contextInjectorMessagesTransform unconditionally:
  if (composer === "create-transform-hooks") names.push("context-injector-messages-transform")
  names.sort()
  constructed[composer] = { file: rel, names, count: names.length }
  totalConstructed += names.length
}

// Curated exceptions verified against the fixed SHA source (see SOURCE-BASELINE.md 4.7):
const exceptions = [
  {
    id: "team-mode-status-injector",
    kind: "bypasses-disabled-hooks",
    reason: "gated by team_mode.enabled, not present in HookNameSchema",
    source: "plugin/hooks/create-transform-hooks.ts:75-81",
  },
  {
    id: "team-mailbox-injector",
    kind: "bypasses-disabled-hooks",
    reason: "gated by team_mode.enabled, not present in HookNameSchema",
    source: "plugin/hooks/create-transform-hooks.ts:83-89",
  },
  {
    id: "context-injector-messages-transform",
    kind: "unconditional",
    reason: "constructed without an isHookEnabled gate",
    source: "plugin/hooks/create-transform-hooks.ts:70-71",
  },
  {
    id: "startup-toast",
    kind: "nested-toggle",
    reason: "passed as showStartupToast option into auto-update-checker",
    source: "plugin/hooks/create-session-hooks.ts:139",
  },
]

const lock = {
  schemaVersion: 1,
  source: "OMO packages/omo-opencode/src",
  generatedAt: new Date().toISOString(),
  expectedConfigurable: EXPECTED_CONFIGURABLE,
  configurableCount: configurable.length,
  configurable,
  constructed,
  totalConstructed,
  exceptions,
}

if (configurable.length !== EXPECTED_CONFIGURABLE) {
  console.error(`hook drift: expected ${EXPECTED_CONFIGURABLE} configurable names, got ${configurable.length}`)
  process.exit(1)
}
writeFileSync(outPath, JSON.stringify(lock, null, 2) + "\n")
console.log(`configurable=${configurable.length} constructed=${totalConstructed} exceptions=${exceptions.length} -> ${outPath}`)
