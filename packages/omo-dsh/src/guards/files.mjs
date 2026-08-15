// omo-dsh file/edit guards (E20), pure part.
// - hashline: stale or ambiguous hashes fail closed
// - notepad: plan/notepad files are append-only for ordinary writes
// - JSON recovery: conservative bounded repair (trailing commas only);
//   anything deeper returns null — never a fake success
// - read-before-write: existing files must be observed before write (policy on)

import { createHash } from "node:crypto"

export function computeHash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function checkHashline({ content, declaredHash }) {
  if (typeof declaredHash !== "string" || declaredHash.length === 0) {
    return { status: "ambiguous", reason: "hashline missing or empty" }
  }
  const actual = computeHash(content)
  if (actual !== declaredHash) {
    return { status: "stale", reason: "content changed since the hashline was written", actual, declaredHash }
  }
  return { status: "ok", actual }
}

export function notepadWriteDecision({ path, notepadPaths, op = "write" }) {
  if (!notepadPaths.includes(path)) return { allowed: true }
  if (op === "append") return { allowed: true, appendOnly: true }
  return { allowed: false, reason: "notepad file is append-only; overwrite/edit would corrupt the audit trail" }
}

export function recoverJson(text) {
  if (typeof text !== "string") return null
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    // conservative repair: strip trailing commas inside arrays/objects
    const repaired = text.replace(/,\s*([}\]])/g, "$1")
    try {
      return { ok: true, value: JSON.parse(repaired), repaired: true }
    } catch {
      return null
    }
  }
}

export function createReadBeforeWriteGuard({ enabled = true } = {}) {
  const reads = new Set()
  return {
    enabled,
    markRead(path) {
      if (!enabled) return
      reads.add(path)
    },
    checkWrite(path, exists) {
      if (!enabled || !exists) return { allowed: true }
      if (!reads.has(path)) {
        return { allowed: false, reason: "existing file was never read; read-before-write policy denies the blind edit" }
      }
      return { allowed: true }
    },
  }
}
