// omo-dsh staging config validator (OMO-0102).
// Pure ESM so tests can run with `node --test` without a TS toolchain.
// JSONC 解析（注释/尾逗号）由后续 omo-config-core adapter 处理；
// 本模块只验证已解析的 JSON 值，接受 JSONC 解析器的输出。

const PRIMARY_ROLES = new Set(["sisyphus", "hephaestus", "prometheus", "atlas"])
const CAPABILITIES = new Set(["text", "tools", "vision", "structured-output"])
const PROMPT_FAMILIES = new Set(["deepseek-v4", "gpt", "qwen", "generic"])
const WRITE_POLICIES = new Set(["compat", "deny-business-files"])
const INTEGRATIONS = new Set(["memory", "team", "openclaw", "monitor"])

// Defaults double as the frozen OMO continuation constants (fixed SHA).
const CONTINUATION_DEFAULTS = {
  countdownMs: 2_000,
  abortWindowMs: 3_000,
  cooldownMs: 5_000,
  compactionGuardMs: 60_000,
  maxStagnation: 3,
  maxConsecutiveFailures: 5,
  failureResetWindowMs: 5 * 60 * 1000,
}

const COMMIT_RE = /^[0-9a-f]{40}$/
const CREDENTIAL_REF_RE = /^credential:[A-Za-z0-9._-]+$/
// Anything resembling a real secret must never appear as a config value.
const SECRET_SNIFF_RE = /(ghp_|sk-|AKIA|-----BEGIN|Bearer\s+|token=)/i

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function fail(errors, path, message) {
  errors.push(`${path}: ${message}`)
}

export function validateOmoDshConfig(config) {
  const errors = []
  if (!isPlainObject(config)) return { ok: false, errors: ["root: expected object"] }

  const topKeys = Object.keys(config)
  const allowedTop = new Set([
    "schemaVersion",
    "compatibility",
    "primaryRole",
    "modelRoutes",
    "task",
    "continuation",
    "atlas",
    "integrations",
    "credentials",
    "telemetry",
  ])
  for (const key of topKeys) if (!allowedTop.has(key)) fail(errors, key, "unknown key")

  // schemaVersion
  if (config.schemaVersion !== 1) fail(errors, "schemaVersion", `expected 1, got ${JSON.stringify(config.schemaVersion)}`)

  // compatibility
  const compat = config.compatibility
  if (!isPlainObject(compat)) {
    fail(errors, "compatibility", "expected object")
  } else {
    for (const [target, entry] of Object.entries(compat)) {
      if (!["omo", "dsh"].includes(target)) fail(errors, `compatibility.${target}`, "unknown target")
      else if (!isPlainObject(entry) || typeof entry.commit !== "string" || !COMMIT_RE.test(entry.commit)) {
        fail(errors, `compatibility.${target}.commit`, "expected 40-char lowercase hex commit SHA")
      }
    }
    if (!compat.omo) fail(errors, "compatibility.omo", "required")
    if (!compat.dsh) fail(errors, "compatibility.dsh", "required")
  }

  // primaryRole
  if (!isPlainObject(config.primaryRole) || !PRIMARY_ROLES.has(config.primaryRole.default)) {
    fail(errors, "primaryRole.default", "expected one of sisyphus|hephaestus|prometheus|atlas")
  }

  // modelRoutes: capability aliases as keys; provider/model live in values so
  // marketing model names are never schema enums. Alias keys must be identifier-like.
  if (!isPlainObject(config.modelRoutes)) {
    fail(errors, "modelRoutes", "expected object")
  } else {
    for (const [alias, route] of Object.entries(config.modelRoutes)) {
      const path = `modelRoutes.${alias}`
      if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(alias)) fail(errors, path, "alias key must match [a-zA-Z][a-zA-Z0-9._-]*")
      if (!isPlainObject(route)) fail(errors, path, "expected object")
      else {
        if (typeof route.provider !== "string" || route.provider.length === 0) fail(errors, `${path}.provider`, "required non-empty string")
        if (typeof route.model !== "string" || route.model.length === 0) fail(errors, `${path}.model`, "required non-empty string")
        if (!Array.isArray(route.capabilities) || route.capabilities.some((c) => !CAPABILITIES.has(c))) {
          fail(errors, `${path}.capabilities`, `expected subset of ${[...CAPABILITIES].join("|")}`)
        }
        if (route.promptFamily !== undefined && !PROMPT_FAMILIES.has(route.promptFamily)) {
          fail(errors, `${path}.promptFamily`, `expected one of ${[...PROMPT_FAMILIES].join("|")}`)
        }
      }
    }
  }

  // task budgets
  if (!isPlainObject(config.task)) {
    fail(errors, "task", "expected object")
  } else {
    const { maxActiveChildren, foregroundTimeoutMs, queue } = config.task
    if (!Number.isInteger(maxActiveChildren) || maxActiveChildren < 1 || maxActiveChildren > 16) {
      fail(errors, "task.maxActiveChildren", "expected integer 1..16")
    }
    if (!Number.isInteger(foregroundTimeoutMs) || foregroundTimeoutMs <= 0) {
      fail(errors, "task.foregroundTimeoutMs", "expected positive integer")
    }
    if (queue !== undefined && (!isPlainObject(queue) || !Number.isInteger(queue.maxSize) || queue.maxSize < 0)) {
      fail(errors, "task.queue.maxSize", "expected non-negative integer")
    }
  }

  // continuation constants
  if (!isPlainObject(config.continuation)) {
    fail(errors, "continuation", "expected object")
  } else {
    for (const key of Object.keys(CONTINUATION_DEFAULTS)) {
      if (key in config.continuation && !(Number.isInteger(config.continuation[key]) && config.continuation[key] > 0)) {
        fail(errors, `continuation.${key}`, "expected positive integer")
      }
    }
    for (const key of ["maxStagnation", "maxConsecutiveFailures"]) {
      const v = config.continuation[key] ?? CONTINUATION_DEFAULTS[key]
      if (v < 1 || v > 10) fail(errors, `continuation.${key}`, "expected integer 1..10")
    }
  }

  // atlas direct-write policy
  if (!isPlainObject(config.atlas) || !WRITE_POLICIES.has(config.atlas.directWritePolicy)) {
    fail(errors, "atlas.directWritePolicy", "expected compat|deny-business-files")
  }

  // integrations feature flags (default off)
  if (!isPlainObject(config.integrations)) {
    fail(errors, "integrations", "expected object")
  } else {
    for (const key of Object.keys(config.integrations)) {
      if (!INTEGRATIONS.has(key)) fail(errors, `integrations.${key}`, "unknown integration")
      else if (typeof config.integrations[key] !== "boolean") fail(errors, `integrations.${key}`, "expected boolean")
    }
  }

  // credentials: names only, never values
  if (!isPlainObject(config.credentials)) {
    fail(errors, "credentials", "expected object")
  } else {
    for (const [key, value] of Object.entries(config.credentials)) {
      if (typeof value !== "string" || !CREDENTIAL_REF_RE.test(value)) {
        fail(errors, `credentials.${key}`, "must be a credential:<name> reference, never a secret value")
      }
    }
  }

  // telemetry/privacy
  if (!isPlainObject(config.telemetry)) {
    fail(errors, "telemetry", "expected object")
  } else {
    if (typeof config.telemetry.enabled !== "boolean") fail(errors, "telemetry.enabled", "expected boolean")
    const endpoint = config.telemetry.endpoint
    if (endpoint !== null && endpoint !== undefined) {
      let ok = typeof endpoint === "string"
      if (ok) {
        try { const u = new URL(endpoint); ok = u.protocol === "https:" || u.hostname === "127.0.0.1" || u.hostname === "localhost" }
        catch { ok = false }
      }
      if (!ok) fail(errors, "telemetry.endpoint", "expected null or https/localhost URL")
    }
    if (config.telemetry.redaction !== undefined && typeof config.telemetry.redaction !== "boolean") {
      fail(errors, "telemetry.redaction", "expected boolean")
    }
  }

  // global secret sniff: any string value that looks like a credential fails closed.
  walkValues(config, (path, value) => {
    if (typeof value === "string" && SECRET_SNIFF_RE.test(value)) {
      fail(errors, path, "value looks like a secret; only credential:<name> references are allowed")
    }
  })

  return { ok: errors.length === 0, errors }
}

function walkValues(node, onValue, path = "root") {
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean" || node === null) {
    onValue(path, node)
    return
  }
  if (Array.isArray(node)) node.forEach((v, i) => walkValues(v, onValue, `${path}[${i}]`))
  else if (isPlainObject(node)) for (const [k, v] of Object.entries(node)) walkValues(v, onValue, `${path}.${k}`)
}

export function defaultConfig() {
  return {
    schemaVersion: 1,
    compatibility: {
      omo: { commit: "038ed0cbbefe2b40677b63867aeea0d16bc303e0" },
      dsh: { commit: "47f943859bef60e4160492346772ded9b24f765a" },
    },
    primaryRole: { default: "sisyphus" },
    modelRoutes: {},
    task: { maxActiveChildren: 4, foregroundTimeoutMs: 15 * 60_000, queue: { maxSize: 64 } },
    continuation: { ...CONTINUATION_DEFAULTS },
    atlas: { directWritePolicy: "compat" },
    integrations: { memory: false, team: false, openclaw: false, monitor: false },
    credentials: {},
    telemetry: { enabled: false, endpoint: null, redaction: true },
  }
}
