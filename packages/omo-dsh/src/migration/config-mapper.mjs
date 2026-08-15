// omo-dsh config migration mapper (E29 dry-run half), pure part.
// Dry-run only: maps OMO root config keys onto the omo-dsh schema where a
// verified mapping exists; every unmapped key is REPORTED, never dropped
// silently; secret-shaped values become credential references; output is
// digest-stable (idempotent reruns).
import { sha256 } from "../compat/prompt.mjs"
import { defaultConfig, validateOmoDshConfig } from "../config/schema-validator.mjs"

const KEY_MAP = Object.freeze({
  team_mode: { to: "integrations.team", kind: "boolean", pick: (v) => v?.enabled === true },
  memory: { to: "integrations.memory", kind: "boolean", pick: (v) => v?.enabled === true },
  monitor: { to: "integrations.monitor", kind: "boolean", pick: (v) => v?.enabled === true },
  openclaw: { to: "integrations.openclaw", kind: "boolean", pick: (v) => v?.enabled === true },
  telemetry: { to: "telemetry.enabled", kind: "boolean", pick: (v) => (typeof v === "boolean" ? v : v?.enabled ?? true) },
})

const SECRET_SNIFF = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{8,})/i

function setPath(target, path, value) {
  const parts = path.split(".")
  let node = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {}
    node = node[parts[i]]
  }
  node[parts[parts.length - 1]] = value
}

export function mapOmoConfigToDsh(omoConfig) {
  const target = defaultConfig()
  const unmapped = []
  const warnings = []
  const credentials = {}
  if (omoConfig === null || typeof omoConfig !== "object" || Array.isArray(omoConfig)) {
    return { ok: false, errors: ["omo config: expected object"], config: null }
  }
  for (const [key, value] of Object.entries(omoConfig)) {
    const mapping = KEY_MAP[key]
    if (mapping) {
      const mapped = mapping.pick(value)
      if (mapped === undefined) { unmapped.push({ key, reason: `${key} present but mapping yielded nothing` }); continue }
      setPath(target, mapping.to, mapped)
      continue
    }
    if (SECRET_SNIFF.test(String(value))) {
      const name = `omo-${key}`
      credentials[name] = `credential:${name}`
      warnings.push(`${key} looks like a secret; stored as credential reference ${name}`)
      continue
    }
    unmapped.push({ key, reason: "no verified mapping; requires owner decision" })
  }
  if (Object.keys(credentials).length > 0) target.credentials = { ...target.credentials, ...credentials }
  const validation = validateOmoDshConfig(target)
  return {
    ok: validation.ok,
    errors: validation.errors,
    config: validation.ok ? target : null,
    unmapped,
    warnings,
    digest: sha256(JSON.stringify({ omoConfig, target })),
  }
}
