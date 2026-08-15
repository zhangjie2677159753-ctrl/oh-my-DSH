// omo-dsh user role commands (OMO-0501), pure parser.
// `/omo-role status` and `/omo-role <sisyphus|hephaestus|prometheus|atlas> [reason]`
// are the ONLY authoritative switch surface. Natural language such as
// "start work" or a SKILL.md read must never flip the role (see G1 checklist).
import { PRIMARY_ROLES } from "../compat/session.mjs"

const COMMAND_PREFIX = "/omo-role"

export function parseRoleCommand(text) {
  if (typeof text !== "string") return null
  const trimmed = text.trim()
  if (!trimmed.startsWith(COMMAND_PREFIX)) return null
  const rest = trimmed.slice(COMMAND_PREFIX.length).trim()
  if (rest === "" || rest === "status") return { kind: "status" }
  const [maybeRole, ...reasonParts] = rest.split(/\s+/)
  if (!PRIMARY_ROLES.includes(maybeRole)) {
    return { kind: "invalid", detail: `unknown role ${JSON.stringify(maybeRole)}` }
  }
  const reason = reasonParts.join(" ").trim()
  return { kind: "switch", role: maybeRole, reason: reason || "user command" }
}

/** Guard used by the command layer: only parsed commands may request a switch. */
export function roleSwitchRequest(text, actor = "user") {
  const parsed = parseRoleCommand(text)
  if (parsed?.kind === "switch") return { role: parsed.role, reason: parsed.reason, actor }
  return null
}
