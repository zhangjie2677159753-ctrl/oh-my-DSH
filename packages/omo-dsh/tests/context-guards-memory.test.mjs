import test from "node:test"
import assert from "node:assert/strict"
import { mergeAgentsHierarchy, resolveRule, assertPathInsideRoot } from "../src/context/rules.mjs"
import { checkHashline, notepadWriteDecision, recoverJson, createReadBeforeWriteGuard, computeHash } from "../src/guards/files.mjs"
import { assertMemoryWriteAllowed, applyRedaction, readScope, tombstone } from "../src/memory/policy.mjs"

// --- E19 context ---

test("hierarchical AGENTS merge: deeper wins, deterministic digest, conflicts recorded", () => {
  const docs = [
    { root: "/repo", path: "/repo/AGENTS.md", depth: 0, sections: { policy: "global", style: "base" } },
    { root: "/repo", path: "/repo/sub/AGENTS.md", depth: 1, sections: { policy: "sub-override" } },
  ]
  const merged = mergeAgentsHierarchy(docs)
  assert.equal(merged.sections.policy, "sub-override")
  assert.equal(merged.sections.style, "base")
  assert.equal(merged.digest.length, 64)
  assert.deepEqual(merged.conflicts, [{ key: "policy", replacedFrom: "/repo/AGENTS.md", replacedBy: "/repo/sub/AGENTS.md" }])
  assert.equal(mergeAgentsHierarchy(docs).digest, merged.digest)
})

test("path traversal and .. are rejected at discovery", () => {
  assert.throws(() => assertPathInsideRoot("/repo", "/etc/passwd"), /escapes/)
  assert.throws(() => assertPathInsideRoot("/repo", "/repo/../etc"), /\.\./)
  assert.doesNotThrow(() => assertPathInsideRoot("/repo", "/repo/sub/file"))
})

test("rules precedence: explicit always beats global; deeper wins ties", () => {
  const rules = [
    { path: "*", value: "global", explicit: false },
    { path: "/repo/src", value: "src-rule", explicit: false },
    { path: "/repo/src/a.ts", value: "explicit-a", explicit: true },
  ]
  const resolution = resolveRule({ rules, path: "/repo/src/a.ts", global: ["global-default"] })
  assert.equal(resolution.effective, "explicit-a")
  const srcOnly = resolveRule({ rules, path: "/repo/src/b.ts" })
  assert.equal(srcOnly.effective, "src-rule")
  const none = resolveRule({ rules: [], path: "/x", global: ["fallback"] })
  assert.equal(none.effective, "fallback")
})

// --- E20 guards ---

test("hashline: ok / stale / ambiguous fail closed", () => {
  const content = "body"
  const hash = computeHash(content)
  assert.equal(checkHashline({ content, declaredHash: hash }).status, "ok")
  assert.equal(checkHashline({ content: content + "x", declaredHash: hash }).status, "stale")
  assert.equal(checkHashline({ content, declaredHash: "" }).status, "ambiguous")
})

test("notepad is append-only; other paths write freely", () => {
  assert.equal(notepadWriteDecision({ path: ".omo/notes.md", notepadPaths: [".omo/notes.md"], op: "append" }).allowed, true)
  assert.equal(notepadWriteDecision({ path: ".omo/notes.md", notepadPaths: [".omo/notes.md"], op: "write" }).allowed, false)
  assert.equal(notepadWriteDecision({ path: "src/x.ts", notepadPaths: [".omo/notes.md"] }).allowed, true)
})

test("JSON recovery repairs only trailing commas; garbage stays null", () => {
  assert.deepEqual(recoverJson('{"a": 1,}'), { ok: true, value: { a: 1 }, repaired: true })
  assert.equal(recoverJson('{"a": '), null)
  assert.equal(recoverJson(42), null)
  const clean = recoverJson('{"a": 1}')
  assert.equal(clean.ok, true)
  assert.equal(clean.repaired, undefined)
})

test("read-before-write denies blind edits of existing files", () => {
  const guard = createReadBeforeWriteGuard()
  assert.equal(guard.checkWrite("src/a.ts", true).allowed, false)
  guard.markRead("src/a.ts")
  assert.equal(guard.checkWrite("src/a.ts", true).allowed, true)
  assert.equal(guard.checkWrite("new/b.ts", false).allowed, true)
  const off = createReadBeforeWriteGuard({ enabled: false })
  assert.equal(off.checkWrite("src/a.ts", true).allowed, true)
})

// --- E23 memory ---

test("memory consent gate and secret sniff", () => {
  assert.equal(assertMemoryWriteAllowed({ scope: "repo", consent: true, content: "ok" }).allowed, true)
  assert.equal(assertMemoryWriteAllowed({ scope: "repo", consent: false, content: "ok" }).allowed, false)
  assert.equal(assertMemoryWriteAllowed({ scope: "repo", consent: true, content: "key sk-abcdefghijklmnop123456" }).allowed, false)
  assert.equal(assertMemoryWriteAllowed({ scope: "wat", consent: true, content: "x" }).allowed, false)
  assert.equal(assertMemoryWriteAllowed({ scope: "session", consent: false, content: "x", sessionScopes: new Set(["session"]) }).allowed, true)
})

test("redaction replaces secrets in place", () => {
  assert.equal(applyRedaction("token sk-abcdefghijklmnop123456 here"), "token [REDACTED] here")
})

test("cross-session isolation: repo memory visible only in its repo scope", () => {
  const entry = { scope: "repo", repoId: "repo-1", content: "x" }
  assert.equal(readScope(entry, { scope: "repo", repoId: "repo-1" }), entry)
  assert.equal(readScope(entry, { scope: "repo", repoId: "repo-2" }), null)
  const sessionEntry = { scope: "session", sessionId: "s1", content: "y" }
  assert.equal(readScope(sessionEntry, { scope: "session", sessionId: "s2" }), null)
  assert.equal(readScope(sessionEntry, { scope: "session", sessionId: "s1" }), sessionEntry)
})

test("deletion is a tombstone: content gone, audit marker retained", () => {
  const entry = { scope: "repo", repoId: "r1", content: "secret-ish" }
  const deleted = tombstone(entry, { at: 1000 })
  assert.equal(deleted.content, undefined)
  assert.equal(deleted.tombstoned, true)
  assert.equal(deleted.tombstonedAt, 1000)
  assert.equal(readScope(deleted, { scope: "repo", repoId: "r1" }), null)
})
