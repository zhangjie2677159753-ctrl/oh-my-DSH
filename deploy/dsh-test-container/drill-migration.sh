#!/usr/bin/env bash
# E29 migration live drill (prepared; runbook: DRILL-RUNBOOK.md).
# All steps drive the pure modules with synthetic fixtures; the container
# probe for M5-real-children is a placeholder until the DSH child binding is
# exercised in the container (see runbook). Output lands in /tmp/omo-drill/ —
# never in the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${DRILL_OUT:-/tmp/omo-drill}"
mkdir -p "$OUT"

echo "== E29 migration drill =="

MODULE_ROOT="$ROOT/packages/omo-dsh/src"
node --input-type=module - "$OUT" "$MODULE_ROOT" <<'NODE'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const out = process.argv[2]
const moduleRoot = process.argv[3]
const load = (p) => import(pathToFileURL(`${moduleRoot}/${p}`).href)
const { mapOmoConfigToDsh } = await load('migration/config-mapper.mjs')
const { createStateMigrator } = await load('migration/state-migrator.mjs')

// M1/M2: config dry-run mapping + idempotent digest
const omoConfig = {
  team_mode: { enabled: true },
  memory: { enabled: true },
  monitor: { enabled: false },
  openclaw: { enabled: true },
  telemetry: false,
  legacy_thing: 42,
  another_unmapped: 'x',
  api_token: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWX',
}
const a = mapOmoConfigToDsh(omoConfig)
const b = mapOmoConfigToDsh(omoConfig)
writeFileSync(`${out}/m1-report.json`, JSON.stringify(a, null, 2))
writeFileSync(`${out}/m2-digest.txt`, `${a.digest}\n${b.digest}\n`)
if (a.digest !== b.digest) throw new Error('M2 FAIL: dry-run not idempotent')
if (a.unmapped.length !== 2) throw new Error(`M1 FAIL: expected 2 unmapped, got ${a.unmapped.length}`)
const credRefs = Object.values(a.config?.credentials ?? {}).filter((v) => String(v).startsWith('credential:'))
if (credRefs.length !== 1) throw new Error('M1 FAIL: secret not turned into a credential reference')
console.log('M1/M2 ok: 2 unmapped reported, secret -> credential ref, digest idempotent')

// M3: forward migration chain with backup at every step
const backups = []
const migrator = createStateMigrator({
  currentVersion: 1,
  migrations: [
    { from: 1, to: 2, migrate: (s) => ({ ...s, version: 2, migrated1: true }) },
    { from: 2, to: 3, migrate: (s) => ({ ...s, version: 3, migrated2: true }) },
  ],
})
const up = await migrator.migrate({ version: 1, data: 'x' }, 3, { backup: (s) => backups.push(structuredClone(s)) })
writeFileSync(`${out}/m3-state.json`, JSON.stringify(up, null, 2))
if (!up.ok || up.state.version !== 3) throw new Error('M3 FAIL: forward migration did not land at v3')
if (backups.length !== 2) throw new Error('M3 FAIL: expected 2 backups (one per step)')

// M4: downgrade without a reversible migration -> read-only refusal
const downMigrator = createStateMigrator({ currentVersion: 3, migrations: [] })
const down = await downMigrator.migrate({ version: 3, data: 'x' }, 1)
writeFileSync(`${out}/m4-downgrade.json`, JSON.stringify(down, null, 2))
if (!down.readOnly) throw new Error('M4 FAIL: downgrade must be read-only without a reversible migration')

// M5 (pure half): migration that does not handle active works blocks
const guard = createStateMigrator({
  currentVersion: 1,
  migrations: [{ from: 1, to: 2, migrate: (s) => ({ ...s, version: 2 }), handlesActiveWork: false }],
})
const blocked = await guard.migrate({ version: 1 }, 2, { activeWorks: ['w1'] })
writeFileSync(`${out}/m5-guard.json`, JSON.stringify(blocked, null, 2))
if (blocked.ok || !blocked.blocked) throw new Error('M5 FAIL: active works must block the migration, never silently drop')

console.log('M3/M4/M5 ok: backups per step, read-only downgrade, active-work guard blocks')
console.log(`E29 drill evidence in ${out}`)
NODE
