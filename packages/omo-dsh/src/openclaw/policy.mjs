// omo-dsh OpenClaw gateway policy (E25), pure part.
// - feature flag defaults OFF; disabled gateway rejects every request
// - non-read requests require an idempotency key
// - outbound AND inbound payloads are redacted at the boundary
// - repeated failures open a circuit → degraded mode; core completion
//   correctness never depends on the gateway
const SECRET_SNIFF = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{8,})/gi

export function redact(text) {
  return String(text).replace(SECRET_SNIFF, "[REDACTED]")
}

export function createOpenClawPolicy({ enabled = false, timeoutMs = 10_000, maxRetries = 3 } = {}) {
  let failures = 0
  let circuitOpen = false
  let requests = 0
  return {
    state: () => ({ enabled, failures, circuitOpen, requests }),
    check({ method = "GET", idempotencyKey = null, payload = null }) {
      requests += 1
      if (!enabled) return { allowed: false, reason: "openclaw disabled (feature flag off by default)" }
      if (circuitOpen) return { allowed: false, reason: "degraded mode: gateway circuit open" }
      if (method !== "GET" && (typeof idempotencyKey !== "string" || idempotencyKey.length === 0)) {
        return { allowed: false, reason: `non-read ${method} requires an idempotency key` }
      }
      const outbound = payload !== null ? redact(JSON.stringify(payload)) : null
      return { allowed: true, timeoutMs, outbound }
    },
    recordOutcome({ ok, inbound = null }) {
      if (ok) {
        failures = 0
        return { degraded: false, inboundRedacted: inbound !== null ? redact(JSON.stringify(inbound)) : null }
      }
      failures += 1
      if (failures >= maxRetries) {
        circuitOpen = true
        return { degraded: true, reason: `circuit open after ${failures} consecutive failures` }
      }
      return { degraded: false, failures }
    },
    resetCircuit() {
      circuitOpen = false
      failures = 0
      return { degraded: false }
    },
  }
}
