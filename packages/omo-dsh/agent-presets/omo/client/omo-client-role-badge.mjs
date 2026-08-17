// omo-dsh client UI projection (G11) — OMO role badge in the composer dock.
// Slot contract verified live: `conversation.composer.dock` — list, scope
// session, registration {id, order, label}, ownerProps
// {session: ConversationSnapshot, input: InputState}. Renders the current
// OMO role folded from the session event stream; renders null when no
// omo/role event exists (a blank session keeps the dock uncluttered).
// Browser verification is a USER step (automated browsers cannot reach the
// container web UI): G1-EVIDENCE documents the check.
//
// Client code is plain JavaScript (no import/JSX); React is provided by the
// client evaluator/bundle.

export const name = 'omo-client-role-badge'

const ROLES = ['sisyphus', 'hephaestus', 'prometheus', 'atlas']
const COLORS = {
  sisyphus: '#4c9aff',
  hephaestus: '#d29922',
  prometheus: '#a371f7',
  atlas: '#3fb950',
}

function foldRole(events) {
  let role = null
  let revision = 0
  for (const event of events ?? []) {
    if (event?.type === 'omo/role') {
      role = event.data?.role ?? role
      revision = event.data?.revision ?? revision
    }
  }
  return role === null || !ROLES.includes(role) ? null : { role, revision }
}

export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  ctx.effect(() => slots.inject('conversation.composer.dock', () => slots.register(
    { name: 'conversation.composer.dock', id: 'omo-role', order: 200, label: 'OMO role' },
    (props) => {
      const snapshot = props?.session
      const events = snapshot?.events ?? snapshot?.eventStream ?? null
      const folded = foldRole(events)
      if (folded === null) return null
      const color = COLORS[folded.role] ?? '#8b98a8'
      return React.createElement(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 10px',
            borderRadius: '999px',
            border: `1px solid ${color}55`,
            background: `${color}14`,
            color,
            fontSize: '11px',
          },
        },
        `OMO · ${folded.role} r${folded.revision}`,
      )
    },
  )), 'omo-role.client-badge')
}
