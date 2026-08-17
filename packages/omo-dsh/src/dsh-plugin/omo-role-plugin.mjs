// omo-role-plugin.mjs — DSH-side primary role tools (E04 first integration).
// Loaded as a file-backed row from this preset directory (name: ./omo-role-plugin.mjs).
// Mirrors the @deepseek-ai/dsh-tool-todo pattern at the pinned SHA:
//   - defineTool from '@deepseek-ai/dsh-tools'
//   - exec.agent.session.append(type, data) — lossless-JSON validated
//   - exec.agent required (role is per-agent-session state)
//
// KNOWN DEVELOPER-PREVIEW RESTRICTION (recorded in docs as R16):
// `omo/role` is an out-of-repo event type. Live append works, but the stock
// persistence coordinator refuses to RESTORE a log containing an unknown
// type that is not marked `ignorable`, and Session.append has no surface to
// mark it. Until DSH grows an event-type registration surface, the OMO layer
// owns role semantics (compat/session.mjs fold) and mirrors the snapshot to
// Boulder storage as the durable fallback.
//
// Round-33 extension (image rebuild deferred until the live eval settles):
//   - dynamic per-role sections (omo:current-role / omo:guard-status /
//     omo:work) refreshed on every omo/role change
//   - subagent/end settlement -> `omo/notification` session event (P2 audit
//     surface; next-turn prompt injection stays a follow-up step)
//   - non-interactive-env banned-command WARNING has NO pre-execute delivery
//     seam in DSH (PreToolDecision is allow/deny/ask only; OMO warns but
//     still executes) — recorded in NATIVE-EQUIVALENCE-PROOFS.md §3.3.
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises'

export const name = 'omo-role'
export const inject = ['tools', 'systemPrompt']
export const Config = z.object({})

const ROLES = ['sisyphus', 'hephaestus', 'prometheus', 'atlas']

// Static OMO identity section, ordered before the persona slot (0) so every
// joined session starts with the OMO authority contract.
export const OMO_IDENTITY_SECTION = {
  name: 'omo:identity',
  order: -50,
  text: [
    'OMO (Oh My OpenAgent) operating contract on DeepSeek Harness.',
    'Primary roles: sisyphus | hephaestus | prometheus | atlas — ONE session, switched via the',
    'authoritative `omo/role` session-log event; prompt text can never change the role.',
    'Hard rules are enforced by code (tool guard waterfall), not by this prompt.',
    'Completion requires machine evidence plus the mandatory Final Verification Wave.',
  ].join('\n'),
}

// Guard decision + dynamic section builders live in the baked omo-plugin tree
// so the same pure functions are unit-tested in the repo and executed by the
// DSH runtime.
const { decideTool } = await import('file:///dsh/omo-plugin/packages-omo-dsh/roles/guard-decision.mjs')
const { buildDynamicSections } = await import('file:///dsh/omo-plugin/packages-omo-dsh/roles/dynamic-sections.mjs')
const { buildNotificationEvent } = await import('file:///dsh/omo-plugin/packages-omo-dsh/children/notification.mjs')
const { buildRoleMirror, parseRoleMirror } = await import('file:///dsh/omo-plugin/packages-omo-dsh/boulder/role-mirror.mjs')
const { assertMemoryWriteAllowed, applyRedaction } = await import('file:///dsh/omo-plugin/packages-omo-dsh/memory/policy.mjs')
const { createMonitorRegistry } = await import('file:///dsh/omo-plugin/packages-omo-dsh/monitor/policy.mjs')
const { validateTeamRoster, createTeamRun } = await import('file:///dsh/omo-plugin/packages-omo-dsh/team/policy.mjs')
const { redact, createOpenClawPolicy } = await import('file:///dsh/omo-plugin/packages-omo-dsh/openclaw/policy.mjs')

function boulderDir() {
  return process.env.OMO_BOULDER_DIR
    ?? (process.env.DSH_HOME ? `${process.env.DSH_HOME}/workspace` : null)
}

async function writeRoleMirror(roleState) {
  const dir = boulderDir()
  if (!dir) return
  const target = `${dir}/.omo/role.json`
  try {
    await mkdir(`${dir}/.omo`, { recursive: true })
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(buildRoleMirror(roleState), null, 2))
    await rename(tmp, target)
  } catch {
    // mirror write is best-effort; the session log stays the live authority
  }
}

function foldRole(session) {
  let role = 'sisyphus'
  let revision = 0
  for (const event of session.events) {
    if (event.type === 'omo/role') {
      role = event.data.role
      revision = event.data.revision
    }
  }
  return { role, revision }
}

function collectDenials(session) {
  // Report the role policy's known denials for the guard-status section.
  // decideTool is per-call; the section lists the POLICY-LEVEL denials for the
  // current role by probing the representative tools (cheap, deterministic).
  const { role } = foldRole(session)
  const probes = ['bash', 'interactive_bash', 'task', 'write']
  const denials = []
  for (const toolName of probes) {
    const decision = decideTool({ role, toolName })
    if (!decision.allow) denials.push({ toolName, allow: false, reason: decision.reason })
  }
  return denials
}

const statusOutput = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      role: { type: 'string', required: true, enum: ROLES },
      revision: { type: 'integer', required: true },
    },
  },
  render: (_args, value) => [{ type: 'text', text: `OMO role: ${value.role} (revision ${value.revision})` }],
}

export function apply(ctx) {
  // Static identity section in the agent scope; disposer-owned via ctx.effect.
  ctx.effect(() => ctx.systemPrompt.section(OMO_IDENTITY_SECTION), 'omo-role.identity-section')

  // Dynamic sections: dispose + re-register on every role change or pending
  // notification change so the prompt always matches the live fold.
  const sectionDisposers = []
  const pendingNotifications = []
  function refreshDynamicSections(session) {
    for (const dispose of sectionDisposers.splice(0)) {
      try { dispose() } catch { /* section already gone */ }
    }
    const { role, revision } = foldRole(session)
    const sections = buildDynamicSections({
      roleState: { role, revision, modelFamily: 'deepseek-v4' },
      guardState: { denials: collectDenials(session) },
      workState: { work: null }, // Boulder projection binding is a follow-up step
    })
    if (pendingNotifications.length > 0) {
      sections.push({
        name: 'omo:notifications',
        order: -10,
        text: 'Background notifications:\n' + pendingNotifications
          .map((n) => `- ${n.status}${n.summary ? ': ' + n.summary : ''}`)
          .join('\n'),
      })
    }
    for (const section of sections) {
      sectionDisposers.push(ctx.systemPrompt.section({ name: section.name, order: section.order, text: section.text }))
    }
  }

  // Settlement -> notification audit event (P2 first half). The next-turn
  // prompt injection of pending notifications is a follow-up step; the event
  // itself is durable and foldable.
  // Source-verified event shape (packages/subagent/subagent/src/types.ts):
  //   subagent/start -> SubagentRunInfo {runId, provider, id, local}
  //   subagent/end   -> SubagentRunEndInfo {runId, provider, id, local,
  //                       stopReason: completed|aborted|error|max-tokens|refusal,
  //                       lastAssistantMessage?}
  // Scoped dispatch (subagent/src/lifecycle.ts): listeners receive ONLY info —
  // the parent carrier keys the scope, it is NOT a listener argument, and the
  // preset mount context does not expose ctx.agent (live-observed rc3/rc4).
  // The CHILD-scope instance therefore captures its session from the guard
  // waterfall (rc3 pattern); the PARENT-side authoritative notification is
  // produced by the tools/post-execute listener below, whose exec.agent is
  // the delegating parent for the subagent tool call itself.
  let waterfallSession = null
  ctx.on('subagent/end', (info) => {
    try {
      const session = waterfallSession
      if (!session?.append) return
      const stopReason = info?.stopReason ?? 'error'
      const notification = buildNotificationEvent({
        childRole: null,
        childSessionId: typeof info?.id === 'string' ? info.id : null,
        status: stopReason === 'completed' ? 'completed'
          : stopReason === 'aborted' ? 'interrupted'
          : 'failed',
        summary: stopReason === 'completed' ? '' : `stopReason: ${stopReason}`,
      })
      session.append('omo/notification', notification)
    } catch {
      // settlement audit must never break the subagent lifecycle
    }
  })

  ctx.tools.register(defineTool({
    name: 'omo_role',
    description:
      'Switch the OMO primary role of the current session (sisyphus|hephaestus|prometheus|atlas). '
      + 'The switch is recorded as an `omo/role` event in the session log; prompt, model route '
      + 'and tool guard all read the resulting role fold. A stale revision is rejected.',
    parameters: {
      role: {
        type: 'string',
        required: true,
        enum: ROLES,
        description: 'Target primary role. Same-role rewrite still appends a new revision.',
      },
      reason: {
        type: 'string',
        required: true,
        description: 'Why the role is changing (recorded for audit).',
      },
    },
    output: statusOutput,
    execute(args, exec) {
      if (!exec.agent) throw new Error('omo_role requires an owning agent session')
      const session = exec.agent.session
      const current = foldRole(session)
      const revision = current.revision + 1
      session.append('omo/role', {
        schemaVersion: 1,
        role: args.role,
        revision,
        changedBy: 'user',
        reason: args.reason,
        changedAt: new Date().toISOString(),
      })
      refreshDynamicSections(session)
      void writeRoleMirror({ role: args.role, revision, changedBy: 'user', reason: args.reason, changedAt: new Date().toISOString() })
      return { role: args.role, revision }
    },
    presentCall: args => ({ card: 'generic', title: 'Switch OMO role', kind: 'other', rawInput: args.role }),
  }))

  ctx.tools.register(defineTool({
    name: 'omo_role_status',
    description: 'Read the current OMO primary role and its revision from the session log fold.',
    parameters: {},
    output: statusOutput,
    execute(_args, exec) {
      if (!exec.agent) throw new Error('omo_role_status requires an owning agent session')
      return foldRole(exec.agent.session)
    },
    presentCall: () => ({ card: 'generic', title: 'Read OMO role', kind: 'other', rawInput: null }),
  }))

  // Monotonic tool guard on the tools/pre-execute waterfall: the frozen role
  // fold decides; a deny here cannot be overridden by later listeners.
  ctx.on('tools/pre-execute', (exec, next) => {
    const agent = exec?.agent
    if (agent?.session) waterfallSession = agent.session
    if (!agent?.session) return next()
    const { role } = foldRole(agent.session)
    const decision = decideTool({ role, toolName: exec.name, args: exec.arguments ?? {} })
    if (!decision.allow) {
      return Promise.resolve({ kind: 'deny', reason: decision.reason })
    }
    return next()
  })

  ctx.tools.register(defineTool({
    name: 'omo_memory_write',
    description: 'Write one memory entry (scope: session). Consent-gated, secret-sniffed, redacted; audited as an omo/memory-write event plus a workspace mirror.',
    parameters: {
      scope: { type: 'string', required: true, enum: ['session'] },
      content: { type: 'string', required: true },
      consent: { type: 'boolean' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', required: true }, reason: { type: 'string' } } },
      render: (_a, v) => [{ type: 'text', text: v.status === 'ok' ? 'memory written' : `memory refused: ${v.reason}` }],
    },
    execute(args, exec) {
      if (!exec.agent) throw new Error('omo_memory_write requires an owning agent session')
      const gate = assertMemoryWriteAllowed({
        scope: args.scope,
        consent: args.consent === true,
        content: args.content,
        sessionScopes: new Set(['session']),
      })
      if (!gate.allowed) return { status: 'refused', reason: gate.reason }
      const content = applyRedaction(args.content)
      exec.agent.session.append('omo/memory-write', {
        schemaVersion: 1,
        scope: args.scope,
        sessionId: exec.agent.session.id ?? null,
        content,
        at: new Date().toISOString(),
      })
      return { status: 'ok' }
    },
    presentCall: args => ({ card: 'generic', title: 'Write OMO memory', kind: 'other', rawInput: args.scope }),
  }))

  ctx.tools.register(defineTool({
    name: 'omo_memory_read',
    description: 'Read the OMO session memory entries written this session (session scope only; folded from omo/memory-write events).',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'integer', required: true }, entries: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { content: { type: 'string' }, at: { type: 'string' } } } } } },
      render: (_a, v) => [{ type: 'text', text: v.count === 0 ? 'session memory: empty' : v.entries.map((e) => `- ${e.content}`).join('\n') }],
    },
    execute(_args, exec) {
      if (!exec.agent) throw new Error('omo_memory_read requires an owning agent session')
      const entries = []
      for (const event of exec.agent.session.events) {
        if (event.type === 'omo/memory-write') entries.push({ content: event.data.content, at: event.data.at })
      }
      return { count: entries.length, entries }
    },
    presentCall: () => ({ card: 'generic', title: 'Read OMO memory', kind: 'other', rawInput: null }),
  }))

  ctx.tools.register(defineTool({
    name: 'omo_boulder_role',
    description: 'Read the OMO role mirror from the Boulder workspace file (cross-restart authority per ADR-R16).',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['ok', 'missing', 'corrupt', 'unsupported-version', 'invalid'] },
          role: { type: 'string' },
          revision: { type: 'integer' },
          authority: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.status === 'ok' ? `Boulder role mirror: ${v.role} (revision ${v.revision})` : `Boulder role mirror: ${v.status}` }],
    },
    async execute() {
      try {
        const dir = boulderDir()
        if (!dir) return { status: 'missing', authority: 'none' }
        const parsed = parseRoleMirror(await readFile(`${dir}/.omo/role.json`, 'utf8'))
        if (parsed.status !== 'ok') return { status: parsed.status, authority: 'none' }
        return { status: 'ok', role: parsed.mirror.role, revision: parsed.mirror.revision, authority: 'boulder-mirror' }
      } catch {
        return { status: 'missing', authority: 'none' }
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Read Boulder role mirror', kind: 'other', rawInput: null }),
  }))

  // Team mode: gated by the mapped OMO config (integrations.team); the DSH
  // surface for team messaging is the subagent mechanism — the policy layer
  // owns roster validation + run semantics, exposed as an on-demand tool.
  const teamEnabled = process.env.OMO_TEAM_ENABLED === '1'
  ctx.tools.register(defineTool({
    name: 'omo_team_status',
    description: 'Read the OMO team mode gate and validate a proposed roster (member names).',
    parameters: {
      workflow: { type: 'string' },
      members: { type: 'array', items: { type: 'string' } },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean', required: true }, rosterOk: { type: 'boolean' }, reason: { type: 'string' } } },
      render: (_a, v) => [{ type: 'text', text: v.enabled ? `team mode enabled; roster ${v.rosterOk ? 'valid' : `invalid: ${v.reason}`}` : 'team mode disabled (set OMO_TEAM_ENABLED=1 to enable)' }],
    },
    execute(args) {
      if (!teamEnabled) return { enabled: false, rosterOk: false, reason: 'team_mode.enabled is false' }
      const members = (args.members ?? []).map((m) => (typeof m === 'string' ? { name: m } : m))
      const errors = validateTeamRoster({ workflow: args.workflow ?? 'default', members })
      return { enabled: true, rosterOk: errors.length === 0, reason: errors.join('; ') }
    },
    presentCall: () => ({ card: 'generic', title: 'Read OMO team gate', kind: 'other', rawInput: null }),
  }))

  // OpenClaw policy: disabled by default (no gateway tooling in Batch A);
  // the policy instance owns redaction + retry semantics for future binding.
  const openClawPolicy = createOpenClawPolicy({ enabled: process.env.OMO_OPENCLAW_ENABLED === '1' })
  ctx.tools.register(defineTool({
    name: 'omo_openclaw_status',
    description: 'Read the OMO OpenClaw policy gate and redact a candidate outbound message.',
    parameters: {
      message: { type: 'string' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean', required: true }, redacted: { type: 'string' } } },
      render: (_a, v) => [{ type: 'text', text: v.enabled ? `openclaw enabled; redacted: ${v.redacted}` : 'openclaw disabled (no gateway binding in Batch A)' }],
    },
    execute(args) {
      return { enabled: openClawPolicy.state().enabled, redacted: redact(args.message ?? '') }
    },
    presentCall: () => ({ card: 'generic', title: 'Read OMO OpenClaw gate', kind: 'other', rawInput: null }),
  }))

  // Monitor registry (per preset instance) + status tool: the monitor-status
  // surface OMO exposes as a prompt injection is here an on-demand tool read.
  const monitorRegistry = createMonitorRegistry()
  monitorRegistry.start({ id: 'session-watchdog', sessionId: 'current' })
  ctx.tools.register(defineTool({
    name: 'omo_monitor_status',
    description: 'Read the OMO monitor registry snapshot (running monitors + interventions).',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { monitors: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, kind: { type: 'string' } } } }, interventions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } } } },
      render: (_a, v) => [{ type: 'text', text: `monitors: ${v.monitors.length}, interventions: ${v.interventions.length}` }],
    },
    execute() {
      return { monitors: monitorRegistry.list().map((m) => ({ id: m.id, kind: m.kind })), interventions: [] }
    },
    presentCall: () => ({ card: 'generic', title: 'Read OMO monitor', kind: 'other', rawInput: null }),
  }))

  // Inject-once semantics: pending notifications ride the next turn's prompt,
  // then clear at its end (upstream chat.message injection analogue).
  ctx.on('turn/end', () => {
    try {
      if (pendingNotifications.length > 0) {
        pendingNotifications.length = 0
        if (waterfallSession) refreshDynamicSections(waterfallSession)
      }
    } catch { /* section refresh must never break the turn */ }
  })

  // Parent-side settlement notification: the subagent tool call itself runs in
  // the parent agent, so post-execute carries exec.agent = parent. Append the
  // owned notification to the PARENT session (P2 authoritative surface); the
  // subagent/end listener above covers the child-side audit trail.
  ctx.on('tools/post-execute', (exec, result, next) => {
    try {
      if (exec?.name === 'subagent' && exec?.agent?.session?.append) {
        const failed = result?.error !== undefined && result?.error !== null
        const notification = buildNotificationEvent({
          childRole: null,
          childSessionId: null,
          status: failed ? 'failed' : 'completed',
          summary: failed ? String(result.error).slice(0, 512) : 'subagent settled',
        })
        exec.agent.session.append('omo/notification', notification)
        pendingNotifications.push(notification)
        refreshDynamicSections(exec.agent.session)
      }
    } catch {
      // notification audit must never break tool execution
    }
    return next()
  })
}
