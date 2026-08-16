import { test } from "node:test"
import assert from "node:assert/strict"
import {
  OMO_PREEMPTIVE_COMPACTION_CONSTANTS,
  DSH_COMPACTION_DEFAULTS,
  resolveCompactionModel,
  buildCompactionConfig,
  buildCompactionFailedEvent,
} from "../src/compaction/policy-config.mjs"
import {
  NOTIFICATION_EVENT_TYPE,
  NOTIFICATION_STATUSES,
  buildNotificationEvent,
  settlementToNotification,
  mergePendingNotifications,
  renderNotificationInjection,
  consumePendingNotifications,
  normalizeStatus,
} from "../src/children/notification.mjs"

// --- P1 compaction policy config ---

test("OMO compaction constants are locked to the upstream values", () => {
  assert.equal(OMO_PREEMPTIVE_COMPACTION_CONSTANTS.timeoutMs, 60_000)
  assert.equal(OMO_PREEMPTIVE_COMPACTION_CONSTANTS.thresholdRatio, 0.78)
  assert.equal(OMO_PREEMPTIVE_COMPACTION_CONSTANTS.cooldownMs, 60_000)
  assert.equal(DSH_COMPACTION_DEFAULTS.retainRatio, 0.16)
})

test("buildCompactionConfig maps 0.78/0.16 exactly", () => {
  const { config, deviations } = buildCompactionConfig()
  assert.equal(config.thresholdRatio, 0.78)
  assert.equal(config.retainRatio, 0.16)
  assert.equal(config.summarizationProvider, "")
  assert.equal(config.summarizationModel, "")
  assert.deepEqual(deviations, [])
})

test("buildCompactionConfig collapses identical per-agent models to the global summarizer", () => {
  const { config, deviations } = buildCompactionConfig({
    perAgentCompactionModels: { sisyphus: "openai/gpt-oss-120b", prometheus: "openai/gpt-oss-120b" },
  })
  assert.equal(config.summarizationProvider, "openai")
  assert.equal(config.summarizationModel, "gpt-oss-120b")
  assert.deepEqual(deviations, [])
})

test("buildCompactionConfig records deviations when per-agent models differ", () => {
  const { config, deviations } = buildCompactionConfig({
    perAgentCompactionModels: { sisyphus: "openai/a", prometheus: "nvidia/b" },
  })
  assert.equal(config.summarizationModel, "")
  assert.equal(deviations.length, 2)
  assert.equal(deviations[0].agent, "sisyphus")
  assert.ok(deviations[0].reason.includes("no compaction-basic seam"))
})

test("resolveCompactionModel replicates the upstream resolver", () => {
  assert.deepEqual(resolveCompactionModel("sisyphus", {}, "o", "m"), { providerID: "o", modelID: "m" })
  assert.deepEqual(
    resolveCompactionModel("sisyphus", { sisyphus: { compaction: { model: "openai/gpt-oss-120b" } } }, "o", "m"),
    { providerID: "openai", modelID: "gpt-oss-120b" },
  )
  // fewer than 2 slash parts -> original (upstream behavior)
  assert.deepEqual(
    resolveCompactionModel("sisyphus", { sisyphus: { compaction: { model: "no-slash" } } }, "o", "m"),
    { providerID: "o", modelID: "m" },
  )
  // model with extra slashes keeps the rest joined
  assert.deepEqual(
    resolveCompactionModel("sisyphus", { sisyphus: { compaction: { model: "p/a/b" } } }, "o", "m"),
    { providerID: "p", modelID: "a/b" },
  )
})

test("buildCompactionFailedEvent carries the 78% message shape", () => {
  const ev = buildCompactionFailedEvent({ sessionId: "s1", reason: "boom", at: "t0" })
  assert.equal(ev.type, "omo/compaction-failed")
  assert.equal(ev.data.schemaVersion, 1)
  assert.ok(ev.data.message.includes("above 78%"))
  assert.ok(ev.data.message.includes("boom"))
})

// --- P2 notification shape ---

test("buildNotificationEvent produces owned lossless-JSON-safe data", () => {
  const ev = buildNotificationEvent({ childRole: "explorer", childSessionId: "c1", status: "completed", summary: "done", at: "t" })
  assert.equal(ev.schemaVersion, 1)
  assert.equal(ev.source, "subagent-end")
  assert.equal(ev.childRole, "explorer")
  assert.equal(ev.childSessionId, "c1")
  assert.equal(ev.status, "completed")
  assert.equal(ev.at, "t")
  // survives a JSON round-trip (no live objects)
  assert.deepEqual(JSON.parse(JSON.stringify(ev)), ev)
})

test("normalizeStatus whitelists the three upstream statuses", () => {
  assert.equal(normalizeStatus("FAILED"), "failed")
  assert.equal(normalizeStatus("interrupted"), "interrupted")
  assert.equal(normalizeStatus("weird"), "completed")
  assert.deepEqual([...NOTIFICATION_STATUSES], ["completed", "failed", "interrupted"])
})

test("settlementToNotification maps ok/failed settlements", () => {
  const ok = settlementToNotification({ childRole: "oracle", childSessionId: "c2", ok: true })
  assert.equal(ok.status, "completed")
  assert.equal(ok.summary, "")
  const bad = settlementToNotification({ childRole: "oracle", childSessionId: "c3", ok: false, error: "boom" })
  assert.equal(bad.status, "failed")
  assert.equal(bad.summary, "boom")
})

test("mergePendingNotifications replaces per childSessionId and caps at 8", () => {
  const base = []
  let pending = base
  const ev = (id, status) => buildNotificationEvent({ childSessionId: id, status })
  for (let i = 0; i < 12; i++) pending = mergePendingNotifications(pending, ev(`c${i}`, "completed"))
  assert.equal(pending.length, 8)
  assert.equal(pending[0].childSessionId, "c4")
  // replacement: latest wins, no duplicate
  pending = mergePendingNotifications(pending, ev("c5", "failed"))
  assert.equal(pending.length, 8)
  assert.equal(pending.filter((e) => e.childSessionId === "c5").length, 1)
  assert.equal(pending.find((e) => e.childSessionId === "c5").status, "failed")
})

test("renderNotificationInjection formats pending notifications and empties on consume", () => {
  const evs = [
    buildNotificationEvent({ childRole: "explorer", childSessionId: "c1", status: "completed" }),
    buildNotificationEvent({ childRole: "oracle", childSessionId: "c2", status: "failed", summary: "context overflow" }),
  ]
  const text = renderNotificationInjection(evs)
  assert.ok(text.includes("[Background Notification] explorer (c1): done"))
  assert.ok(text.includes("[Background Notification] oracle (c2): failed — context overflow"))
  assert.equal(renderNotificationInjection([]), "")
  const consumed = consumePendingNotifications(evs)
  assert.deepEqual(consumed.pending, [])
  assert.equal(consumed.text, text)
})

test("NOTIFICATION_EVENT_TYPE is the foldable session event type", () => {
  assert.equal(NOTIFICATION_EVENT_TYPE, "omo/notification")
})
