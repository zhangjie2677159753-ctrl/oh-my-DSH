import test from "node:test"
import assert from "node:assert/strict"
import { REQUIRED_CAPABILITIES, OPTIONAL_CAPABILITIES, probeReport, assertCapabilities } from "../src/compat/dsh-api.mjs"

test("empty report fails closed with all required capabilities missing", () => {
  const report = probeReport([])
  assert.equal(report.ok, false)
  assert.equal(report.missing.length, REQUIRED_CAPABILITIES.length)
  assert.throws(() => assertCapabilities(report), /missing required DSH capabilities/)
})

test("full report passes", () => {
  const report = probeReport([...REQUIRED_CAPABILITIES])
  assert.equal(report.ok, true)
  assert.doesNotThrow(() => assertCapabilities(report))
})

test("unknown capability names fail loudly", () => {
  const report = probeReport([...REQUIRED_CAPABILITIES, "legacy.apiproxy-frame"])
  assert.equal(report.ok, true)
  assert.throws(() => assertCapabilities(report), /unknown capability names/)
})

test("optional capabilities are reported separately and never required", () => {
  const report = probeReport([...REQUIRED_CAPABILITIES, ...OPTIONAL_CAPABILITIES])
  assert.deepEqual(report.optional, [...OPTIONAL_CAPABILITIES])
  assert.doesNotThrow(() => assertCapabilities(report))
})
