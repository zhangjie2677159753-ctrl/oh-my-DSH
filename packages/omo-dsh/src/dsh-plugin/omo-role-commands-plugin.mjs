// OMO role commands for the DSH Commands UI (click-to-switch, no model
// round-trip). This plugin lives in the OMO preset subtree, so its command
// registrations are agent-scoped: the four commands appear in the composer
// "Commands" menu of OMO sessions only.
//
// A click executes commands.execute(agent, line) directly: the handler runs
// omo_role through the real tool pipeline, so the switch keeps every verified
// semantic — omo/role session-log event, dynamic prompt-section refresh, and
// the Boulder role-mirror write (R16 fallback) — byte-for-byte the same code
// path as a model-requested switch.
//
// The tool pipeline reads exec.signal, so the UI's invocation signal is
// forwarded into the call. A NEW file URL (not appended to an already-imported
// module) keeps the loader's ESM cache from serving a stale version: new
// sessions mount this fresh, no host restart needed.

const ROLE_COMMANDS = [
  { name: 'role-sisyphus', role: 'sisyphus', label: 'Sisyphus（执行者）' },
  { name: 'role-hephaestus', role: 'hephaestus', label: 'Hephaestus（实现/工程）' },
  { name: 'role-prometheus', role: 'prometheus', label: 'Prometheus（规划/蓝图）' },
  { name: 'role-atlas', role: 'atlas', label: 'Atlas（全局/统筹）' },
]

export function apply(ctx) {
  // The command child activates only when a command registry is composed;
  // registration through commandCtx files into THIS agent's scope layer.
  ctx.inject(['commands'], (commandCtx) => {
    for (const entry of ROLE_COMMANDS) {
      commandCtx.commands.register({
        name: entry.name,
        description: `切换 OMO 主角色为 ${entry.label}`,
        recordInput: false,
        handler: async ({ agent, signal }) => {
          if (signal && signal.aborted) return { kind: 'error', text: 'command aborted' }
          const tools = ctx.get('tools')
          if (tools === undefined) return { kind: 'error', text: 'tools 服务不可用' }
          try {
            const result = await tools.execute({
              name: 'omo_role',
              arguments: { role: entry.role, reason: `UI command /${entry.name}` },
              agent,
              signal,
            })
            if (result && result.error !== undefined && result.error !== null) {
              const message = typeof result.error === 'string'
                ? result.error
                : (result.error && result.error.message)
                  ? String(result.error.message)
                  : 'tool error'
              return { kind: 'error', text: message }
            }
          } catch (error) {
            return { kind: 'error', text: String(error && error.message ? error.message : error) }
          }
          let revision = 0
          for (const event of agent.session.events) {
            if (event && event.type === 'omo/role' && event.data) revision = event.data.revision
          }
          return { kind: 'success', text: `已切换为 ${entry.label}（revision ${revision}）` }
        },
      })
    }
  })
}
