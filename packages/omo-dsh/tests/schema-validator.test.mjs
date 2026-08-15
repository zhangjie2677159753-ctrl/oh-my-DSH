import test from "node:test"
import assert from "node:assert/strict"
import { validateOmoDshConfig, defaultConfig } from "../src/config/schema-validator.mjs"

test("default config validates", () => {
  const result = validateOmoDshConfig(defaultConfig())
  assert.equal(result.ok, true, result.errors.join("; "))
})

test("unknown top-level key fails", () => {
  const cfg = defaultConfig()
  cfg.surprise = true
  const result = validateOmoDshConfig(cfg)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes("surprise") && e.includes("unknown key")))
})

test("bad commit SHA fails", () => {
  const cfg = defaultConfig()
  cfg.compatibility.omo.commit = "not-a-sha"
  const result = validateOmoDshConfig(cfg)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes("commit")))
})

test("illegal primary role fails", () => {
  const cfg = defaultConfig()
  cfg.primaryRole.default = "atlas-junior"
  assert.equal(validateOmoDshConfig(cfg).ok, false)
})

test("model route alias keys must be identifier-like; model ids live in values", () => {
  const cfg = defaultConfig()
  cfg.modelRoutes["primary deep"] = { provider: "p", model: "m", capabilities: ["text"], promptFamily: "generic" }
  assert.equal(validateOmoDshConfig(cfg).ok, false)
  delete cfg.modelRoutes["primary deep"]
  cfg.modelRoutes.primaryDeep = { provider: "p", model: "gpt-5.6-luna", capabilities: ["text"], promptFamily: "gpt" }
  assert.equal(validateOmoDshConfig(cfg).ok, true)
})

test("capability subset validated", () => {
  const cfg = defaultConfig()
  cfg.modelRoutes.primaryDeep = { provider: "p", model: "m", capabilities: ["text", "json"], promptFamily: "generic" }
  const result = validateOmoDshConfig(cfg)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes("capabilities")))
})

test("continuation constants must be positive integers and bounded", () => {
  const cfg = defaultConfig()
  cfg.continuation.maxStagnation = 0
  assert.equal(validateOmoDshConfig(cfg).ok, false)
  cfg.continuation.maxStagnation = 99
  assert.equal(validateOmoDshConfig(cfg).ok, false)
  cfg.continuation.maxStagnation = 3
  cfg.continuation.countdownMs = -1
  assert.equal(validateOmoDshConfig(cfg).ok, false)
})

test("atlas directWritePolicy enum", () => {
  const cfg = defaultConfig()
  cfg.atlas.directWritePolicy = "deny-everything"
  assert.equal(validateOmoDshConfig(cfg).ok, false)
  cfg.atlas.directWritePolicy = "deny-business-files"
  assert.equal(validateOmoDshConfig(cfg).ok, true)
})

test("integrations default off, unknown integration fails", () => {
  const cfg = defaultConfig()
  cfg.integrations.team = true
  assert.equal(validateOmoDshConfig(cfg).ok, true)
  cfg.integrations.claude = true
  assert.equal(validateOmoDshConfig(cfg).ok, false)
})

test("credentials must be references, never secret values", () => {
  const cfg = defaultConfig()
  cfg.credentials.openclaw = "credential:openclaw-main"
  assert.equal(validateOmoDshConfig(cfg).ok, true)
  cfg.credentials.openclaw = "ghp_abcdefghijklmnopqrstuvwx1234567890"
  const result = validateOmoDshConfig(cfg)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes("secret")))
})

test("secret sniff catches tokens anywhere in the tree", () => {
  const cfg = defaultConfig()
  cfg.modelRoutes.primaryDeep = { provider: "sk-abcdef123456", model: "m", capabilities: ["text"], promptFamily: "generic" }
  const result = validateOmoDshConfig(cfg)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes("secret")))
})

test("telemetry endpoint restricted to https/localhost", () => {
  const cfg = defaultConfig()
  cfg.telemetry.endpoint = "http://evil.example.com"
  assert.equal(validateOmoDshConfig(cfg).ok, false)
  cfg.telemetry.endpoint = "https://metrics.internal"
  assert.equal(validateOmoDshConfig(cfg).ok, true)
})
