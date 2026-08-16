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
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'omo-role'
export const inject = ['tools', 'systemPrompt']
export const Config = z.object({})

const ROLES = ['sisyphus', 'hephaestus', 'prometheus', 'atlas']

// Static OMO identity section, ordered before the persona slot (0) so every
// joined session starts with the OMO authority contract. Per-role dynamic
// sections stay pending until the scope→agent mapping is verified at the
// fixed SHA (see src/continuation/DSH-BINDING.md).
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

// Guard decision + policy live in the baked omo-plugin tree so the same pure
// function is unit-tested in the repo and executed by the DSH waterfall.
const { decideTool } = await import('file:///dsh/omo-plugin/packages-omo-dsh/roles/guard-decision.mjs')

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
    if (!agent?.session) return next()
    const { role } = foldRole(agent.session)
    const decision = decideTool({ role, toolName: exec.name, args: exec.arguments ?? {} })
    if (!decision.allow) {
      return Promise.resolve({ kind: 'deny', reason: decision.reason })
    }
    return next()
  })
}
