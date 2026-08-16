#!/usr/bin/env node
// Generate docs/plans/hook-closure-status.json: per-hook disposition mapped
// onto our implemented modules/tests. This closes G5's tracking half; the
// DSH runtime binding half stays pending per hook.
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const inventory = JSON.parse(readFileSync(join(here, "..", "docs/plans/hook-inventory.lock.json"), "utf8"))

const DISPOSITIONS = {
  "todo-continuation-enforcer": { dshComponent: "continuation/driver.mjs", status: "contract-level", tests: "lifecycle-planning-continuation.test.mjs" },
  "session-notification": { dshComponent: "host session/event projection", status: "pending-binding", tests: null },
  "comment-checker": { dshComponent: "guards/comment-checker.mjs", status: "contract-level", tests: "adapters.test.mjs" },
  "tool-output-truncator": { dshComponent: "guards/adapters.mjs", status: "contract-level", tests: "adapters.test.mjs" },
  "question-label-truncator": { dshComponent: "guards/adapters.mjs", status: "contract-level", tests: "adapters.test.mjs" },
  "directory-agents-injector": { dshComponent: "context/rules.mjs", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "directory-readme-injector": { dshComponent: "context/rules.mjs", status: "pending-binding", tests: null },
  "empty-task-response-detector": { dshComponent: "tasks/task.mjs + reconciler", status: "contract-level", tests: "task.test.mjs" },
  "think-mode": { dshComponent: "model-binding promptFamily", status: "pending-binding", tests: null },
  "model-fallback": { dshComponent: "compat/routing.mjs fallback machine", status: "contract-level", tests: "routing.test.mjs" },
  "anthropic-context-window-limit-recovery": { dshComponent: "provider-specific", status: "compat-only", tests: null },
  "preemptive-compaction": { dshComponent: "DSH compaction policy", status: "native-equivalent", tests: null },
  "rules-injector": { dshComponent: "context/rules.mjs", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "background-notification": { dshComponent: "Job/subagent settlement", status: "native-equivalent", tests: null },
  "auto-update-checker": { dshComponent: "package update service", status: "out-of-scope-batch-a", tests: null },
  "codegraph-bootstrap": { dshComponent: "optional integration", status: "out-of-scope-batch-a", tests: null },
  "ast-grep-sg-provision": { dshComponent: "tool provisioning", status: "out-of-scope-batch-a", tests: null },
  "startup-toast": { dshComponent: "nested auto-update toggle", status: "nested-toggle", tests: null },
  "keyword-detector": { dshComponent: "command/input transform", status: "pending-binding", tests: null },
  "agent-usage-reminder": { dshComponent: "prompt reminder", status: "pending-binding", tests: null },
  "non-interactive-env": { dshComponent: "shell adapter", status: "native-equivalent", tests: null },
  "interactive-bash-session": { dshComponent: "DSH Terminal", status: "native-equivalent", tests: null },
  "tool-pair-validator": { dshComponent: "compat/tools.mjs post hooks", status: "contract-level", tests: "tools.test.mjs" },
  "monitor-status-injector": { dshComponent: "monitor/policy.mjs projection", status: "contract-level", tests: "team-monitor-openclaw.test.mjs" },
  "goal": { dshComponent: "compat/goals-todos.mjs + DSH goal", status: "contract-level", tests: "goals-todos.test.mjs" },
  "category-skill-reminder": { dshComponent: "task router + skills registry", status: "pending-binding", tests: null },
  "compaction-context-injector": { dshComponent: "compaction/resume-context.mjs", status: "contract-level", tests: "reconciler-resume.test.mjs" },
  "compaction-todo-preserver": { dshComponent: "compaction/resume-context.mjs", status: "contract-level", tests: "reconciler-resume.test.mjs" },
  "claude-code-hooks": { dshComponent: "hook bridge", status: "compat-only", tests: null },
  "auto-slash-command": { dshComponent: "DSH Commands", status: "native-equivalent", tests: null },
  "edit-error-recovery": { dshComponent: "guards/files.mjs recoverJson", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "json-error-recovery": { dshComponent: "guards/files.mjs recoverJson", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "delegate-task-retry": { dshComponent: "compat/routing.mjs", status: "contract-level", tests: "routing.test.mjs" },
  "prometheus-md-only": { dshComponent: "roles/policy-registry.mjs fileGuard", status: "contract-level", tests: "roles.test.mjs" },
  "sisyphus-junior-notepad": { dshComponent: "guards/files.mjs notepad policy", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "team-tool-gating": { dshComponent: "team/policy.mjs", status: "contract-level", tests: "team-monitor-openclaw.test.mjs" },
  "no-sisyphus-gpt": { dshComponent: "route guard", status: "compat-only", tests: null },
  "no-hephaestus-non-gpt": { dshComponent: "route guard", status: "compat-only", tests: null },
  "hephaestus-agents-md-injector": { dshComponent: "context/rules.mjs role scoping", status: "pending-binding", tests: null },
  "start-work": { dshComponent: "work/start-work.mjs", status: "contract-level", tests: "start-work-atlas.test.mjs" },
  "atlas": { dshComponent: "atlas/work-policy.mjs", status: "contract-level", tests: "start-work-atlas.test.mjs" },
  "unstable-agent-babysitter": { dshComponent: "tasks/reconciler.mjs", status: "contract-level", tests: "reconciler-resume.test.mjs" },
  "task-resume-info": { dshComponent: "compaction/resume-context.mjs", status: "contract-level", tests: "reconciler-resume.test.mjs" },
  "stop-continuation-guard": { dshComponent: "continuation/driver.mjs stopRequested", status: "contract-level", tests: "lifecycle-planning-continuation.test.mjs" },
  "tasks-todowrite-disabler": { dshComponent: "roles/policy-registry.mjs denyTodoTools", status: "contract-level", tests: "roles.test.mjs" },
  "runtime-fallback": { dshComponent: "compat/routing.mjs", status: "contract-level", tests: "routing.test.mjs" },
  "write-existing-file-guard": { dshComponent: "guards/files.mjs read-before-write", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "notepad-write-guard": { dshComponent: "guards/files.mjs notepad policy", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "bash-file-read-guard": { dshComponent: "shell policy", status: "pending-binding", tests: null },
  "hashline-read-enhancer": { dshComponent: "guards/files.mjs checkHashline", status: "contract-level", tests: "context-guards-memory.test.mjs" },
  "read-image-resizer": { dshComponent: "guards/adapters.mjs", status: "contract-level", tests: "adapters.test.mjs" },
  "todo-description-override": { dshComponent: "task semantics", status: "pending-binding", tests: null },
  "webfetch-redirect-guard": { dshComponent: "guards/adapters.mjs", status: "contract-level", tests: "adapters.test.mjs" },
  "fsync-skip-warning": { dshComponent: "filesystem correctness warning", status: "compat-only", tests: null },
  "plan-format-validator": { dshComponent: "planning/plan-ir.mjs", status: "contract-level", tests: "plan-ir.test.mjs" },
  "legacy-plugin-toast": { dshComponent: "migration UI", status: "compat-only", tests: null },
}

const rows = inventory.configurable.map((name) => ({
  name,
  disposition: DISPOSITIONS[name] ?? { dshComponent: "unassigned", status: "unassigned", tests: null },
}))

const statuses = {}
for (const row of rows) statuses[row.disposition.status] = (statuses[row.disposition.status] ?? 0) + 1

const closure = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "docs/plans/hook-inventory.lock.json + generator tools/generate-hook-closure.mjs",
  total: rows.length,
  statusCounts: statuses,
  rows,
  note: "contract-level = pure module + tests; pending-binding = DSH runtime binding not started; unassigned must be resolved before E22 closes",
}

writeFileSync(join(here, "..", "docs/plans/hook-closure-status.json"), JSON.stringify(closure, null, 2) + "\n")
console.log(`hook closure: ${rows.length} rows;`, JSON.stringify(statuses))
