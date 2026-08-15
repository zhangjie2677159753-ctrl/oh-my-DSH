// omo-dsh role prompt router (OMO-0403), pure part.
// One section manifest per (role, modelFamily); inactive roles resolve to
// empty sections WITHOUT re-registering tools — the catalog stays stable
// across role switches. Mandatory policy sections are enforced by
// compat/prompt.mjs assemblePrompt.
import { assemblePrompt } from "../compat/prompt.mjs"

export function createRoleRouter({ manifests }) {
  const errors = []
  for (const manifest of manifests) {
    try {
      assemblePrompt(manifest, { role: manifest.role, modelFamily: manifest.modelFamily, revision: 0 })
    } catch (error) {
      errors.push(`manifest ${manifest.role}/${manifest.modelFamily}: ${error.message}`)
    }
  }
  if (errors.length > 0) throw new TypeError(`createRoleRouter: invalid manifests — ${errors.join("; ")}`)

  return {
    manifests,

    resolve(roleState, modelFamily, options = {}) {
      const manifest = manifests.find((m) => m.role === roleState.role && m.modelFamily === modelFamily)
      if (!manifest) {
        // role/modelFamily without a manifest still gets a stable, empty,
        // mandatory-intact assembly via the first manifest of that role —
        // but a role with NO manifest at all is a configuration error.
        const anyRoleManifest = manifests.find((m) => m.role === roleState.role)
        if (!anyRoleManifest) throw new TypeError(`createRoleRouter: no manifest for role ${roleState.role}`)
        return assemblePrompt(anyRoleManifest, { role: "none", modelFamily, revision: roleState.revision, ...options })
      }
      return assemblePrompt(manifest, { role: roleState.role, modelFamily, revision: roleState.revision, ...options })
    },

    // For the tool guard: which manifest revision governs this role at this revision.
    binding(roleState, modelFamily) {
      const manifest = manifests.find((m) => m.role === roleState.role && m.modelFamily === modelFamily)
        ?? manifests.find((m) => m.role === roleState.role)
      return { role: roleState.role, roleRevision: roleState.revision, modelFamily, manifestRole: manifest?.role ?? null }
    },
  }
}
