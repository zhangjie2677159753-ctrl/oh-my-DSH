import test from "node:test"
import assert from "node:assert/strict"
import { mergeSkills, createInvocationTracker, SCOPE_PRIORITY } from "../src/skills/policy.mjs"
import { evaluateCommentCheck, commentCheckMissingBinary, COMMENT_CHECKER_CONTRACT } from "../src/guards/comment-checker.mjs"

// --- E19 skills ---

test("scope priority: higher scope wins on name conflict; dedupe keeps winner", () => {
  const merged = mergeSkills({
    discovered: [
      { name: "ulw-plan", scope: "shared/builtin" },
      { name: "ulw-plan", scope: "user" },
      { name: "ulw-plan", scope: "project" },
      { name: "only-project", scope: "project" },
    ],
  })
  assert.equal(merged.counts.effective, 2)
  const ulw = merged.skills.find((s) => s.name === "ulw-plan")
  assert.equal(ulw.scope, "project")
  assert.deepEqual(merged.conflicts.map((c) => [c.name, c.kept, c.dropped]), [
    ["ulw-plan", "user", "shared/builtin"],
    ["ulw-plan", "project", "user"],
  ])
})

test("disable list removes by lowercase name; enable acts as allowlist", () => {
  const base = [
    { name: "Alpha", scope: "user" },
    { name: "beta", scope: "user" },
    { name: "gamma", scope: "user" },
  ]
  const disabled = mergeSkills({ discovered: base, disable: ["ALPHA", { name: "beta", disable: true }] })
  assert.deepEqual(disabled.skills.map((s) => s.name), ["gamma"])
  const allowed = mergeSkills({ discovered: base, enable: ["gamma"] })
  assert.deepEqual(allowed.skills.map((s) => s.name), ["gamma"])
  assert.equal(mergeSkills({ discovered: base, disable: [false] }).counts.effective, 3) // false entries inert
})

test("explicit load only; SKILL.md reads never count as invocations", () => {
  const tracker = createInvocationTracker()
  assert.equal(tracker.wasInvoked("ulw-plan"), false)
  assert.equal(tracker.observeSkillFileRead().invoked, false)
  tracker.recordExplicitLoad("ulw-plan", "slash-command")
  assert.equal(tracker.wasInvoked("ULW-PLAN"), true)
  assert.equal(tracker.list().length, 1)
  assert.throws(() => tracker.recordExplicitLoad("", "api"), /skill name/)
})

test("scope priority table matches the verified loader order", () => {
  assert.deepEqual(SCOPE_PRIORITY, {
    "shared/builtin": 1, "config": 2, "user": 3, "opencode": 4, "project": 5, "opencode-project": 6,
  })
})

// --- E20 comment checker ---

test("exit 0 is clean; exit 2 reports capped feedback", () => {
  assert.equal(evaluateCommentCheck({ exitCode: 0 }).report, false)
  const long = "x".repeat(10_000)
  const finding = evaluateCommentCheck({ exitCode: 2, stderr: long })
  assert.equal(finding.report, true)
  assert.equal(finding.message.length, COMMENT_CHECKER_CONTRACT.maxFeedbackBytes)
})

test("unknown exit codes surface but never count as findings", () => {
  const out = evaluateCommentCheck({ exitCode: 1, stderr: "boom" })
  assert.equal(out.report, false)
  assert.equal(out.reason, "unexpected exit 1")
})

test("per-session 30s dedupe suppresses identical findings", () => {
  let state = { lastAt: null, lastDigest: null }
  const t0 = 100_000
  const first = evaluateCommentCheck({ exitCode: 2, stderr: "same", now: () => t0, state })
  assert.equal(first.report, true)
  state = first.state
  const second = evaluateCommentCheck({ exitCode: 2, stderr: "same", now: () => t0 + 10_000, state })
  assert.equal(second.report, false)
  assert.equal(second.deduped, true)
  const later = evaluateCommentCheck({ exitCode: 2, stderr: "same", now: () => t0 + 40_000, state })
  assert.equal(later.report, true)
})

test("missing binary is silent and never blocks", () => {
  const out = commentCheckMissingBinary()
  assert.equal(out.report, false)
  assert.equal(out.silent, true)
})
