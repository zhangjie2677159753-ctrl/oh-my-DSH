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

  // Dynamic sections: dispose + re-register on every role change so the
  // current-role/guard-status/work text always matches the live fold.
  const sectionDisposers = []
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
  // the parent carrier keys the scope, it is NOT a listener argument. The
  // parent session is therefore captured from the pre-execute guard below
  // (every tool call — including the subagent tool itself — passes through).
  let parentSession = null
  ctx.on('subagent/end', (info) => {
    try {
      const session = parentSession
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
    if (agent?.session) parentSession = agent.session
    if (!agent?.session) return next()
    const { role } = foldRole(agent.session)
    const decision = decideTool({ role, toolName: exec.name, args: exec.arguments ?? {} })
    if (!decision.allow) {
      return Promise.resolve({ kind: 'deny', reason: decision.reason })
    }
    return next()
  })
}
