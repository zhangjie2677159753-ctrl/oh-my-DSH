import test from "node:test"
import assert from "node:assert/strict"
import {
  truncateToolOutput, truncateQuestionLabel, evaluateWebfetchRedirect, evaluateImageResize,
  OUTPUT_TRUNCATION, QUESTION_LABEL, WEBFETCH_REDIRECT, IMAGE_RESIZE,
} from "../src/guards/adapters.mjs"

test("output truncation keeps header lines and reports dropped lines", () => {
  const small = truncateToolOutput({ text: "ok" })
  assert.equal(small.truncated, false)
  const big = truncateToolOutput({ text: Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n"), maxTokens: 50 })
  assert.equal(big.truncated, true)
  assert.equal(big.suppressed, false)
  assert.ok(big.text.startsWith("line 0\nline 1\nline 2\n"))
  assert.ok(/\d+ more lines truncated/.test(big.text))
})

test("webfetch gets its own 10k-token budget", () => {
  const big = "x".repeat(60_000)
  const generic = truncateToolOutput({ text: big, toolName: "read" })
  const webfetch = truncateToolOutput({ text: big, toolName: "webfetch" })
  assert.ok(webfetch.text.length < generic.text.length)
})

test("exhausted budget suppresses the output", () => {
  const out = truncateToolOutput({ text: "1\n2\n3\n4\n5\n6", maxTokens: 1 })
  assert.equal(out.suppressed, true)
  assert.equal(out.text, OUTPUT_TRUNCATION.suppressedText)
})

test("question label truncates to 27 + ellipsis above 30 chars", () => {
  assert.equal(truncateQuestionLabel("short"), "short")
  assert.equal(truncateQuestionLabel("x".repeat(29)).length, 29)
  const long = truncateQuestionLabel("x".repeat(40))
  assert.equal(long, "x".repeat(QUESTION_LABEL.truncateTo) + QUESTION_LABEL.ellipsis)
})

test("webfetch redirect: follows redirect statuses up to 10, then fixed error", () => {
  const first = evaluateWebfetchRedirect({ status: 302, location: "https://next" })
  assert.equal(first.follow, true)
  assert.equal(first.redirectCount, 1)
  const over = evaluateWebfetchRedirect({ status: 302, redirectCount: 11 })
  assert.equal(over.exceeded, true)
  assert.equal(over.errorText, "Error: WebFetch failed: exceeded maximum redirects (10)")
  assert.equal(evaluateWebfetchRedirect({ status: 200 }).follow, false)
  assert.deepEqual(WEBFETCH_REDIRECT.redirectStatuses, [301, 302, 303, 307, 308])
})

test("image resize decisions: keep / resize / remove / provider gate", () => {
  const keep = evaluateImageResize({ mime: "image/png", width: 800, height: 600, fileSize: 100_000 })
  assert.equal(keep.action, "keep")
  assert.equal(keep.estimatedTokens, Math.ceil(800 * 600 / 750))
  const resize = evaluateImageResize({ mime: "image/png", width: 4000, height: 3000, fileSize: 1_000_000 })
  assert.equal(resize.action, "resize")
  assert.equal(resize.targetLongEdge, IMAGE_RESIZE.maxLongEdge)
  assert.deepEqual(resize.qualityTiers, [80, 60, 40])
  const remove = evaluateImageResize({ mime: "image/png", width: 100, height: 100, fileSize: 6 * 1024 * 1024 })
  assert.equal(remove.action, "remove-attachment")
  const other = evaluateImageResize({ mime: "image/png", width: 100, height: 100, fileSize: 1000, provider: "openai" })
  assert.equal(other.action, "keep")
  assert.equal(evaluateImageResize({ mime: "image/bmp", width: 100, height: 100, fileSize: 1000 }).action, "keep")
})
