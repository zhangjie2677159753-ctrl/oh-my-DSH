import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluateSessionNotify, SESSION_NOTIFY, buildReadmeInjection, createReadmeInjector,
  evaluateThinkMode, detectKeywordMode, createAgentUsageReminder, createCategorySkillReminder,
  evaluateHephaestusAgentsInjection, evaluateBashFileRead, overrideTodoDescription,
} from "../src/guards/reminders.mjs"

test("session notify: relevant events, main session only, defaults", () => {
  const idle = evaluateSessionNotify({ eventType: "session.idle" })
  assert.equal(idle.notify, true)
  assert.equal(idle.delayMs, 1500)
  assert.equal(idle.sound, false)
  assert.equal(idle.maxTracked, 100)
  assert.equal(evaluateSessionNotify({ eventType: "session.idle", isMainSession: false }).notify, false)
  assert.equal(evaluateSessionNotify({ eventType: "turn/end" }).notify, false)
})

test("readme injection is once per directory", () => {
  assert.equal(buildReadmeInjection("/repo/README.md"), "[Project README: /repo/README.md]")
  const injector = createReadmeInjector()
  assert.equal(injector.once("/repo"), "/repo")
  assert.equal(injector.once("/repo"), null)
})

test("think mode: keyword match switches to high unless already high", () => {
  assert.equal(evaluateThinkMode({ text: "let me think", keywords: ["think"], currentVariant: null }).switchTo, "high")
  assert.equal(evaluateThinkMode({ text: "let me think", keywords: ["think"], currentVariant: "high" }).switchTo, null)
  assert.equal(evaluateThinkMode({ text: "plain", keywords: ["think"] }).switchTo, null)
})

test("keyword modes: main-only gating and .hpp guard", () => {
  const keywords = { "ultrawork": ["ulw"], "hyperplan": ["hyperplan"], "team": ["team-mode"] }
  const main = detectKeywordMode({ text: "ulw task", keywords, isMainSession: true })
  assert.equal(main.triggered, true)
  assert.ok(main.modes.includes("ultrawork"))
  const child = detectKeywordMode({ text: "run hyperplan", keywords, isMainSession: false })
  assert.equal(child.triggered, false)
  const guarded = detectKeywordMode({ text: "hyperplan plz", keywords, isMainSession: true, hasHppFile: true })
  assert.equal(guarded.triggered, false)
  assert.equal(guarded.reason.includes(".hpp"), true)
})

test("agent usage reminder: max 3, suppressed after delegation", () => {
  const reminder = createAgentUsageReminder({ isOrchestrator: true, maxReminders: 3 })
  assert.equal(reminder.onTool({ toolName: "grep" }).remind, true)
  reminder.onTool({ toolName: "glob" })
  reminder.onTool({ toolName: "webfetch" })
  assert.equal(reminder.onTool({ toolName: "read" }).remind, false)
  assert.equal(reminder.onTool({ toolName: "task" }).delegatedNow, true)
  assert.equal(reminder.onTool({ toolName: "grep" }).remind, false)
  const nonOrchestrator = createAgentUsageReminder({ isOrchestrator: false })
  assert.equal(nonOrchestrator.onTool({ toolName: "grep" }).remind, false)
})

test("category skill reminder: threshold of 3 delegable calls, role gated", () => {
  const reminder = createCategorySkillReminder({ role: "atlas", threshold: 3 })
  reminder.onTool({ toolName: "grep" })
  reminder.onTool({ toolName: "glob" })
  assert.equal(reminder.onTool({ toolName: "read" }).inject, true)
  assert.equal(reminder.onTool({ toolName: "grep" }).inject, false) // counter reset
  assert.equal(createCategorySkillReminder({ role: "prometheus" }), null)
})

test("hephaestus AGENTS injection: role, first-message, once per session", () => {
  assert.equal(evaluateHephaestusAgentsInjection({ role: "sisyphus" }).inject, false)
  assert.equal(evaluateHephaestusAgentsInjection({ role: "hephaestus", userMessageCount: 0 }).inject, true)
  assert.equal(evaluateHephaestusAgentsInjection({ role: "hephaestus", userMessageCount: 1 }).inject, false)
  assert.equal(evaluateHephaestusAgentsInjection({ role: "hephaestus", alreadyInjected: true }).inject, false)
})

test("bash file read: simple cat/head/tail warn, never block", () => {
  assert.equal(evaluateBashFileRead("cat src/index.ts").warn, true)
  assert.equal(evaluateBashFileRead("head -20 a.txt").warn, true)
  assert.equal(evaluateBashFileRead("npm test").warn, false)
  assert.equal(evaluateBashFileRead("rm -rf .").warn, false)
})

test("todo description override enforces the four-element contract", () => {
  const text = overrideTodoDescription()
  assert.ok(text.includes("WHERE"))
  assert.ok(text.includes("WHY"))
  assert.ok(text.includes("HOW"))
  assert.ok(text.includes("RESULT"))
  assert.ok(text.includes("1-3"))
})
