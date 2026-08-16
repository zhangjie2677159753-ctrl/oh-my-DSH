// omo-dsh tool guard decision (OMO-0404 DSH binding half), pure part.
// The SAME function the DSH plugin registers on tools/pre-execute; unit-
// tested here so the runtime glue stays thin.
import { PRIMARY_ROLE_POLICIES, prometheusFileGuard } from "./policy-registry.mjs"
import { resolveToolDecision } from "../compat/tools.mjs"

export function decideTool({ role, toolName, args = {}, profile = "compat" }) {
  const entry = PRIMARY_ROLE_POLICIES[role]
  if (!entry) return { allow: true, reason: `no policy for role ${role}; default allow at guard layer` }
  const policy = profile === "deny-business-files" && entry["deny-business-files"] ? entry["deny-business-files"] : (entry.compat ?? entry)
  const decision = resolveToolDecision(policy, role, toolName)
  if (decision.decision === "deny") {
    return { allow: false, reason: `omo role ${role} denies ${toolName}` }
  }
  // Prometheus write-path narrowing: Write/Edit only for .omo/*.md
  if (role === "prometheus" && ["write", "edit"].includes(toolName)) {
    const filePath = args.filePath ?? args.path ?? args.file
    if (typeof filePath === "string" && filePath.length > 0) {
      const guard = prometheusFileGuard(filePath)
      if (!guard.allowed) return { allow: false, reason: guard.reason }
    }
  }
  return { allow: true }
}
