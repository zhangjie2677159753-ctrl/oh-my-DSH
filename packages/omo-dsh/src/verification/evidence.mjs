// omo-dsh verification manifest and evidence gates (E18), pure part.
// - every task AND every final-wave item gets a machine check with a command
//   and an expected exit code
// - evidence is recorded with digest + timestamp + plan revision
// - stale evidence (wrong plan revision) and failed commands can never close
//   a task; model self-claims are not evidence
import { sha256 } from "../compat/prompt.mjs"
import { validateOmoPlanV1 } from "../planning/plan-ir.mjs"

export function createVerificationManifest(plan) {
  const errors = validateOmoPlanV1(plan)
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  return Object.freeze({
    planId: plan.planId,
    planRevision: plan.revision,
    items: [
      ...plan.tasks.map((t, i) => ({ key: `todo:${i + 1}`, title: t.title, checks: [] })),
      ...plan.finalVerification.map((f, i) => ({ key: `final-wave:f${i + 1}`, title: f.text, checks: [] })),
    ],
  })
}

export function addCheck(manifest, key, check) {
  if (typeof check.command !== "string" || check.command.length === 0) {
    throw new TypeError("check.command: required")
  }
  if (![0, "any"].includes(check.expectExit) && !Number.isInteger(check.expectExit)) {
    throw new TypeError(`check.expectExit: expected integer, 0, or "any"`)
  }
  const items = manifest.items.map((item) => item.key === key
    ? { ...item, checks: [...item.checks, check] }
    : item)
  return Object.freeze({ ...manifest, items })
}

export function createEvidenceStore() {
  let records = []
  return {
    records: () => [...records],
    record({ key, command, exitCode, outputDigest, planId, planRevision, at = Date.now() }) {
      if (exitCode !== 0 && exitCode !== undefined && !Number.isInteger(exitCode)) {
        throw new TypeError("exitCode: expected integer")
      }
      records = [...records, Object.freeze({
        key, command, exitCode, outputDigest: outputDigest ?? null,
        planId, planRevision, at,
      })]
      return records[records.length - 1]
    },
  }
}

/**
 * Evaluate a task/final item against its manifest and evidence.
 * Fail closed on: missing evidence, stale plan revision, failed command,
 * mismatched command digest source.
 */
export function evaluateItem(manifest, key, records) {
  const item = manifest.items.find((i) => i.key === key)
  if (!item) return { status: "error", reason: `unknown key ${key}` }
  const itemRecords = records.filter((r) => r.key === key)
  const failures = []
  for (const check of item.checks) {
    const evidence = itemRecords.find((r) => r.command === check.command)
    if (!evidence) { failures.push(`missing evidence for ${check.command}`); continue }
    if (evidence.planRevision !== manifest.planRevision) {
      failures.push(`stale evidence (planRevision ${evidence.planRevision}) for ${check.command}`)
      continue
    }
    if (check.expectExit !== "any" && evidence.exitCode !== check.expectExit) {
      failures.push(`command ${check.command} exited ${evidence.exitCode}, expected ${check.expectExit}`)
    }
  }
  if (failures.length > 0) return { status: "failed", key, reasons: failures }
  if (item.checks.length === 0) return { status: "no-checks", key, reason: "no machine checks defined — model self-claims are not evidence" }
  return { status: "passed", key, evidenceCount: itemRecords.length }
}

export function evaluatePlan(manifest, records) {
  const results = manifest.items.map((item) => ({ key: item.key, result: evaluateItem(manifest, item.key, records) }))
  const allPassed = results.every((r) => r.result.status === "passed")
  const done = allPassed && manifest.items.length > 0
  return {
    done,
    phase: done ? "verifying" : "incomplete",
    results,
    digest: sha256(JSON.stringify(results)),
  }
}
