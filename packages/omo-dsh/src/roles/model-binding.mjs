// omo-dsh primary role → model route binding (OMO-0405), pure part.
// Capability aliases from config; canonical candidate/fallback chains stay
// differential fixtures against model-core (see PAR-MODEL-001). This module
// only resolves ONE frozen binding per step so prompt/model/guard never tear.
import { sha256 } from "../compat/prompt.mjs"

export const ROLE_ROUTE_DEFAULTS = Object.freeze({
  sisyphus: "primary.deep",
  hephaestus: "primary.deep",
  prometheus: "planning.interview",
  atlas: "primary.deep",
})

export const CATEGORY_ROUTE_DEFAULTS = Object.freeze({
  quick: "primary.fast",
  explore: "primary.fast",
  librarian: "primary.fast",
  oracle: "planning.deep",
  metis: "planning.deep",
  momus: "planning.deep",
  plan: "planning.compiler",
  multimodal: "vision.default",
})

export function resolvePrimaryRoute({ role, category = null, aliases, requiredCapabilities = [], failOnMissing = true }) {
  const aliasId = category ? (CATEGORY_ROUTE_DEFAULTS[category] ?? ROLE_ROUTE_DEFAULTS[role]) : ROLE_ROUTE_DEFAULTS[role]
  const alias = aliases[aliasId]
  if (!alias) {
    if (failOnMissing) throw new TypeError(`resolvePrimaryRoute: alias ${aliasId} missing from config`)
    return { status: "unavailable", aliasId, reason: `alias ${aliasId} missing` }
  }
  const missing = requiredCapabilities.filter((cap) => !alias.capabilities.includes(cap))
  if (missing.length > 0) {
    return { status: "capability-mismatch", aliasId, missing }
  }
  const binding = {
    status: "ok",
    aliasId,
    role,
    category,
    provider: alias.provider,
    model: alias.model,
    promptFamily: alias.promptFamily ?? "generic",
    capabilities: [...alias.capabilities],
    policyRevision: sha256(`${role}|${category ?? ""}|${aliasId}|${[...requiredCapabilities].sort().join(",")}`),
  }
  return Object.freeze(binding)
}
