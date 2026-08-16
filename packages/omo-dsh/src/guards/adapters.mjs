// omo-dsh adapter hook policies (E22 partial), pure decision layer.
// Constants and behaviors verified against the fixed-SHA hook sources
// (docs/upstream/adapter-hooks-fixture.json); pixel-level image resizing and
// network redirect resolution remain runtime bindings.
export const OUTPUT_TRUNCATION = Object.freeze({
  defaultMaxTokens: 50_000,
  webfetchMaxTokens: 10_000,
  tokenChars: 4,
  keepHeaderLines: 3,
  dynamicRatio: 0.5,
  whitelist: Object.freeze([
    "read", "bash", "grep", "glob", "webfetch", "WebFetch",
    "task", "task_*", "write", "edit", "multiedit", "apply_patch",
  ]),
  suppressedText: "[Output suppressed - context window exhausted]",
})

export const QUESTION_LABEL = Object.freeze({ maxLength: 30, truncateTo: 27, ellipsis: "..." })

export const WEBFETCH_REDIRECT = Object.freeze({
  maxRedirects: 10,
  redirectStatuses: Object.freeze([301, 302, 303, 307, 308]),
  timeoutMs: 30_000,
  maxTimeoutMs: 120_000,
})

export const IMAGE_RESIZE = Object.freeze({
  mimes: Object.freeze(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  tokensPerPixels: 750,
  maxLongEdge: 1568,
  maxFileSize: 5 * 1024 * 1024,
  qualityTiers: Object.freeze([80, 60, 40]),
  headerBytes: 32_768,
  provider: "anthropic",
})

export function truncateToolOutput({ text, toolName = "", maxTokens = OUTPUT_TRUNCATION.defaultMaxTokens, remainingTokens = null }) {
  if (typeof text !== "string") throw new TypeError("text: expected string")
  const isWebfetch = /webfetch/i.test(toolName)
  let target = isWebfetch ? OUTPUT_TRUNCATION.webfetchMaxTokens : maxTokens
  if (remainingTokens !== null && remainingTokens !== undefined) {
    target = Math.min(target, Math.floor(remainingTokens * OUTPUT_TRUNCATION.dynamicRatio))
  }
  const budgetChars = target * OUTPUT_TRUNCATION.tokenChars
  if (text.length <= budgetChars) return { truncated: false, text, suppressed: false }
  const lines = text.split("\n")
  const header = lines.slice(0, OUTPUT_TRUNCATION.keepHeaderLines)
  const rest = lines.slice(OUTPUT_TRUNCATION.keepHeaderLines)
  let body = []
  let used = header.join("\n").length
  for (const line of rest) {
    if (used + line.length + 1 > budgetChars) break
    body.push(line)
    used += line.length + 1
  }
  const kept = [...header, ...body]
  if (kept.length === header.length) {
    return { truncated: true, suppressed: true, text: OUTPUT_TRUNCATION.suppressedText }
  }
  const dropped = lines.length - kept.length
  return { truncated: true, suppressed: false, text: `${kept.join("\n")}\n[${dropped} more lines truncated...]` }
}

export function truncateQuestionLabel(label) {
  if (typeof label !== "string" || label.length === 0) return label
  if (label.length <= QUESTION_LABEL.maxLength) return label
  return label.slice(0, QUESTION_LABEL.truncateTo) + QUESTION_LABEL.ellipsis
}

export function evaluateWebfetchRedirect({ status, redirectCount = 0, location = null }) {
  if (redirectCount > WEBFETCH_REDIRECT.maxRedirects) {
    return { follow: false, exceeded: true, errorText: `Error: WebFetch failed: exceeded maximum redirects (${WEBFETCH_REDIRECT.maxRedirects})` }
  }
  if (WEBFETCH_REDIRECT.redirectStatuses.includes(status)) {
    return { follow: true, location, redirectCount: redirectCount + 1 }
  }
  return { follow: false, reason: `status ${status} is not a redirect` }
}

export function evaluateImageResize({ mime, width, height, fileSize, provider = IMAGE_RESIZE.provider }) {
  if (provider !== IMAGE_RESIZE.provider) return { action: "keep", reason: "resizer only applies to the anthropic provider" }
  if (!IMAGE_RESIZE.mimes.includes(mime)) return { action: "keep", reason: `unsupported mime ${mime}` }
  if (fileSize > IMAGE_RESIZE.maxFileSize) {
    return { action: "remove-attachment", reason: "file exceeds 5MB", estimatedTokens: null }
  }
  const longEdge = Math.max(width, height)
  const estimatedTokens = Math.ceil((width * height) / IMAGE_RESIZE.tokensPerPixels)
  if (longEdge <= IMAGE_RESIZE.maxLongEdge) {
    return { action: "keep", estimatedTokens, longEdge }
  }
  return { action: "resize", reason: `long edge ${longEdge} > ${IMAGE_RESIZE.maxLongEdge}`, estimatedTokens, targetLongEdge: IMAGE_RESIZE.maxLongEdge, qualityTiers: [...IMAGE_RESIZE.qualityTiers] }
}
