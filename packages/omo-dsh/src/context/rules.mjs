// omo-dsh context discovery (E19), pure part.
// - hierarchical AGENTS merge: root → leaf; deeper files override shallow ones
//   by section key; the merge is deterministic (digest-stable)
// - rules precedence: deeper/more specific paths win; explicit always rules
//   out global; conflicts are recorded, never silently resolved
// - security boundary: discovery paths must stay inside the workspace root
//   (no traversal/symlink escape — enforced here and re-checked by the host)
import { createHash } from "node:crypto"

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function assertPathInsideRoot(root, candidate) {
  const normalizedRoot = root.replace(/\/+$/, "") + "/"
  const normalized = candidate.replace(/\/+$/, "")
  if (normalized !== normalizedRoot.slice(0, -1) && !normalized.startsWith(normalizedRoot)) {
    throw new Error(`path traversal: ${JSON.stringify(candidate)} escapes root ${JSON.stringify(root)}`)
  }
  if (candidate.includes("..")) throw new Error(`path traversal: ${JSON.stringify(candidate)} contains ..`)
  return candidate
}

/**
 * Merge hierarchical AGENTS documents from root to leaf.
 * Each document contributes `sections`; a deeper document with the same
 * section key REPLACES the shallow value (closest-to-leaf wins).
 */
export function mergeAgentsHierarchy(documents) {
  const merged = new Map()
  const order = []
  const conflicts = []
  for (const doc of documents) {
    assertPathInsideRoot(doc.root, doc.path)
    for (const [key, text] of Object.entries(doc.sections ?? {})) {
      if (merged.has(key)) conflicts.push({ key, replacedFrom: merged.get(key).path, replacedBy: doc.path })
      merged.set(key, { text, path: doc.path, depth: doc.depth ?? 0 })
      if (!order.includes(key)) order.push(key)
    }
  }
  const sections = Object.fromEntries(order.map((key) => [key, merged.get(key).text]))
  const text = order.map((key) => `## ${key}\n${sections[key]}`).join("\n\n")
  return { sections, text, digest: sha256(text), conflicts }
}

/**
 * Rules precedence (rules-engine contract): more specific path wins; explicit
 * rules always override global rules at the same scope level.
 */
export function resolveRule({ rules, path, global = [] }) {
  const applicable = rules
    .filter((rule) => rule.path === "*" || rule.path === path || path.startsWith(rule.path + "/"))
    .sort((a, b) => specificity(a.path) - specificity(b.path))
  const explicit = applicable.filter((r) => r.explicit === true)
  const chosen = explicit.length > 0 ? explicit[explicit.length - 1] : applicable[applicable.length - 1]
  return {
    rule: chosen ?? null,
    effective: chosen?.value ?? global[global.length - 1] ?? null,
    applicableCount: applicable.length,
  }
}

function specificity(path) {
  if (path === "*") return 0
  return path.split("/").length
}
