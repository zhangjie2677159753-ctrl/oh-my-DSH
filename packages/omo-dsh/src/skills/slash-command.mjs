// omo-dsh slash-command executor compat, pure part.
// Native-equivalence #5 compat patch (docs/plans/NATIVE-EQUIVALENCE-PROOFS.md §5).
// Verified at the fixed SHA (hooks/auto-slash-command/executor.ts):
// - variable pattern /\$\{user_message\}|\$ARGUMENTS|\$SESSION_ID|\$TIMESTAMP/g
// - substituteCommandTemplate throws MissingCommandSessionIDError when
//   content contains "$SESSION_ID" but no sessionID is provided
// - template sections order: header, Description, User Arguments, Model,
//   Agent, Scope, "---", "## Command Instructions", substituted content,
//   optional "---" + "## User Request" + args (only when args present AND
//   content references NEITHER ${user_message} NOR $ARGUMENTS)
// - findCommand matches lowercased name over [...skillCommands, ...scoped
//   discovered commands]; skill commands therefore win name conflicts
// - skill command with metadata.agent that differs from options.agent is
//   rejected: `Skill "<name>" is restricted to agent "<agent>"`
// - not-found error: `Command "/<name>" not found. Use the skill tool to
//   list available skills and commands.`
// - load failure: `Failed to load command "/<name>": <message>`
// DSH side: pure renderer; command discovery/registration is supplied by the
// caller (ctx.commands.register contributions), keeping this module testable.

export const COMMAND_TEMPLATE_VARIABLE_PATTERN = /\$\{user_message\}|\$ARGUMENTS|\$SESSION_ID|\$TIMESTAMP/g

export class MissingCommandSessionIDError extends Error {
  constructor() {
    super("Command template requires a session ID")
    this.name = "MissingCommandSessionIDError"
  }
}

/** Map a loaded skill (skills/policy.mjs output shape) to a skill command info. */
export function skillToCommandInfo(skill) {
  const def = skill?.definition ?? skill ?? {}
  return {
    name: String(skill?.name ?? def.name ?? ""),
    path: skill?.path,
    metadata: {
      name: skill?.name,
      description: def.description || "",
      argumentHint: def.argumentHint,
      model: def.model,
      agent: def.agent,
      subtask: def.subtask,
    },
    content: def.template,
    scope: "skill",
    lazyContentLoader: skill?.lazyContent,
  }
}

/**
 * Substitute template variables exactly like upstream. `now` is injectable
 * for deterministic tests.
 */
export function substituteCommandTemplate(content, args, sessionID, now = () => new Date()) {
  if (content.includes("$SESSION_ID") && !sessionID) {
    throw new MissingCommandSessionIDError()
  }
  const timestamp = now().toISOString()
  return content.replace(COMMAND_TEMPLATE_VARIABLE_PATTERN, (variable) => {
    switch (variable) {
      case "${user_message}":
      case "$ARGUMENTS":
        return args
      case "$SESSION_ID":
        return sessionID ?? ""
      case "$TIMESTAMP":
        return timestamp
      default:
        return variable
    }
  })
}

/**
 * Render the upstream command template. `resolveFileRefs`/`resolveNested`
 * are injected (DSH binding provides real resolvers; default is passthrough).
 * Returns { ok, replacementText } | { ok:false, error }.
 */
export async function formatCommandTemplate(cmd, args, sessionID, hooks = {}) {
  const resolveFileRefs = hooks.resolveFileRefs ?? (async (text) => text)
  const resolveNested = hooks.resolveNested ?? (async (text) => text)
  const now = hooks.now ?? (() => new Date())
  const sections = []

  sections.push(`# /${cmd.name} Command\n`)
  if (cmd.metadata.description) sections.push(`**Description**: ${cmd.metadata.description}\n`)
  if (args) sections.push(`**User Arguments**: ${args}\n`)
  if (cmd.metadata.model) sections.push(`**Model**: ${cmd.metadata.model}\n`)
  if (cmd.metadata.agent) sections.push(`**Agent**: ${cmd.metadata.agent}\n`)
  sections.push(`**Scope**: ${cmd.scope}\n`)
  sections.push("---\n")
  sections.push("## Command Instructions\n")

  let content = cmd.content || ""
  if (!content && cmd.lazyContentLoader?.load) content = await cmd.lazyContentLoader.load()
  const withFileRefs = await resolveFileRefs(content)
  const resolvedContent = await resolveNested(withFileRefs)
  const substituted = substituteCommandTemplate(resolvedContent, args, sessionID, now)
  sections.push(substituted.trim())

  if (args && !resolvedContent.includes("${user_message}") && !resolvedContent.includes("$ARGUMENTS")) {
    sections.push("\n\n---\n")
    sections.push("## User Request\n")
    sections.push(args)
  }
  return { ok: true, replacementText: sections.join("\n") }
}

/**
 * Pure executor over a caller-supplied command catalog. The catalog must
 * already be ordered like upstream: skill commands first, then scoped
 * discovered commands.
 */
export async function executeSlashCommand(parsed, options = {}) {
  const commands = options.commands ?? []
  const command = commands.find((c) => String(c?.name ?? "").toLowerCase() === String(parsed?.command ?? "").toLowerCase()) ?? null
  if (!command) {
    return {
      success: false,
      error: `Command "/${parsed.command}" not found. Use the skill tool to list available skills and commands.`,
    }
  }
  if (command.scope === "skill" && command.metadata.agent) {
    if (!options.agent || command.metadata.agent !== options.agent) {
      return {
        success: false,
        error: `Skill "${command.name}" is restricted to agent "${command.metadata.agent}"`,
      }
    }
  }
  try {
    const { replacementText } = await formatCommandTemplate(command, parsed.args ?? "", options.sessionID, options)
    return { success: true, replacementText }
  } catch (err) {
    return {
      success: false,
      error: `Failed to load command "/${parsed.command}": ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Detector replica: reject excluded commands, parse /name args out of user text. */
export const SLASH_COMMAND_PATTERN = /^\/([a-zA-Z@][\w.:@/-]*)\s*(.*)/
export const EXCLUDED_COMMANDS = new Set(["ralph-loop", "cancel-ralph", "ulw-loop"])

export function detectSlashCommand(promptText) {
  if (typeof promptText !== "string") return null
  const stripped = promptText.replace(/```[\s\S]*?```/g, "").trim()
  if (!stripped.startsWith("/")) return null
  const m = SLASH_COMMAND_PATTERN.exec(stripped)
  if (!m) return null
  const command = m[1].toLowerCase()
  if (EXCLUDED_COMMANDS.has(command)) return null
  return { command, args: m[2] ?? "", raw: stripped }
}
