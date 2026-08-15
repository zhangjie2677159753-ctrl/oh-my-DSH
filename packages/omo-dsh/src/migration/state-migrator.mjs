// omo-dsh state migration (E29 state half), pure part.
// - versioned chain: from → to with a migrate function per step
// - backup before EVERY step (restorable)
// - idempotent: running the same input twice yields the same digest
// - downgrade without a defined reverse migration → read-only refusal
// - active work/children are explicit inputs: an unhandled boundary blocks
//   instead of silently dropping live state
import { sha256 } from "../compat/prompt.mjs"

export function createStateMigrator({ migrations, currentVersion }) {
  const byFrom = new Map(migrations.map((m) => [m.from, m]))
  return {
    currentVersion,
    async migrate(state, targetVersion, { activeWorks = [], backup = null } = {}) {
      const path = []
      let current = structuredClone(state)
      let version = currentVersion
      const backups = []
      const warnings = []

      if (targetVersion < version) {
        // downgrade: only defined reverse migrations may run; otherwise read-only
        const reverse = migrations.find((m) => m.from === version && m.to === targetVersion && m.reversible === true)
        if (!reverse) {
          return { ok: false, readOnly: true, reason: `downgrade ${version} → ${targetVersion} requires a defined reversible migration` }
        }
      }

      while (version < targetVersion) {
        const migration = byFrom.get(version)
        if (!migration) {
          return { ok: false, blocked: true, reason: `no migration from version ${version}`, path }
        }
        if (migration.handlesActiveWork === false && activeWorks.length > 0) {
          return { ok: false, blocked: true, reason: `migration ${version}→${migration.to} does not handle active works (${activeWorks.length}); settle or export first`, path }
        }
        if (backup) backups.push({ from: version, snapshot: backup(current) })
        current = migration.migrate(structuredClone(current), { activeWorks })
        version = migration.to
        path.push({ from: migration.from, to: migration.to })
      }
      if (version !== targetVersion) {
        return { ok: false, blocked: true, reason: `landed at version ${version}, target ${targetVersion}`, path }
      }
      return {
        ok: true,
        version,
        state: current,
        path,
        backups,
        digest: sha256(JSON.stringify(current)),
        warnings,
      }
    },
  }
}
