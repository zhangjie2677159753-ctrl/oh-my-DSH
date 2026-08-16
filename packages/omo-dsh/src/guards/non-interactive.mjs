// omo-dsh non-interactive-env guard, pure part.
// Native-equivalence #3 compat patch (docs/plans/NATIVE-EQUIVALENCE-PROOFS.md §3).
// Verified at the fixed SHA (packages/omo-opencode/src/hooks/non-interactive-env/*):
// - tool.execute.before handles ONLY tool === "bash" with a string command
// - banned detection: SHELL_COMMAND_PATTERNS.banned entries WITHOUT "(" are
//   compiled to /\b<cmd>\b/ patterns; on match the output.message becomes
//   "Warning: '<cmd>' is an interactive command that may hang in non-interactive environments."
// - git commands (/\bgit\b/) additionally get a non-interactive env prefix
//   (export VAR=val; / setenv / $env: / set ... &&) prepended; idempotent:
//   a command already starting with the prefix is left alone.
// - NOTE (verified upstream behavior): the TTY check was intentionally removed;
//   env vars are ALWAYS injected for git commands.
//
// UPSTREAM BUG (verified at the fixed SHA, non-interactive-env-hook.ts
// detectBannedCommand): it returns SHELL_COMMAND_PATTERNS.banned[i] using the
// index from the FILTERED pattern list. Indices >= 7 misalign, so `git add -p`
// reports "python (REPL)" and `git rebase -i` reports "node (REPL)". omo-dsh
// replicates INTENT: the warning names the matched command itself. Recorded in
// SOURCE-BASELINE.md (upstream behavioral-replay divergence note).

/** Non-interactive environment table (upstream constants.ts:3-24). */
export const NON_INTERACTIVE_ENV = Object.freeze({
  CI: "true",
  DEBIAN_FRONTEND: "noninteractive",
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  HOMEBREW_NO_AUTO_UPDATE: "1",
  GIT_EDITOR: ":",
  EDITOR: ":",
  VISUAL: "",
  GIT_SEQUENCE_EDITOR: ":",
  GIT_MERGE_AUTOEDIT: "no",
  GIT_PAGER: "cat",
  PAGER: "cat",
  npm_config_yes: "true",
  PIP_NO_INPUT: "1",
  YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
})

/** Raw banned list (upstream SHELL_COMMAND_PATTERNS.banned, 11 entries). */
export const BANNED_COMMANDS = Object.freeze([
  "vim", "nano", "vi", "emacs", // editors
  "less", "more", "man", // pagers
  "python (REPL)", "node (REPL)", // REPLs without -c/-e
  "git add -p", "git rebase -i", // interactive git modes
])

// Filtered to entries without "(" and compiled exactly as upstream, but paired
// with their OWN command name (intent fix for the upstream index misalignment).
const BANNED_COMMAND_PATTERNS = BANNED_COMMANDS.filter((cmd) => !cmd.includes("(")).map((cmd) => ({
  pattern: new RegExp(`\\b${cmd}\\b`),
  command: cmd,
}))

/** Return the matched banned command, or null. */
export function detectBannedCommand(command) {
  for (const { pattern, command: name } of BANNED_COMMAND_PATTERNS) {
    if (pattern.test(command)) return name
  }
  return null
}

function shellEscape(value, shellType) {
  const s = String(value)
  if (s === "") return shellType === "cmd" ? '""' : "''"
  switch (shellType) {
    case "unix":
    case "csh":
      if (/[^a-zA-Z0-9_\-.:\/]/.test(s)) return `'${s.replace(/'/g, "'\\''")}'`
      return s
    case "powershell":
      return `'${s.replace(/'/g, "''")}'`
    case "cmd":
      return `"${s.replace(/%/g, "%%").replace(/"/g, '""')}"`
    default:
      return s
  }
}

/** Replicate upstream shared/shell-env.ts buildEnvPrefix for all four shells. */
export function buildEnvPrefix(env, shellType) {
  const entries = Object.entries(env)
  if (entries.length === 0) return ""
  switch (shellType) {
    case "unix": {
      const assignments = entries.map(([k, v]) => `${k}=${shellEscape(v, shellType)}`).join(" ")
      return `export ${assignments};`
    }
    case "csh": {
      const assignments = entries.map(([k, v]) => `setenv ${k} ${shellEscape(v, shellType)}`).join("; ")
      return `${assignments};`
    }
    case "powershell": {
      const assignments = entries.map(([k, v]) => `$env:${k}=${shellEscape(v, shellType)}`).join("; ")
      return `${assignments};`
    }
    case "cmd": {
      const assignments = entries.map(([k, v]) => `set ${k}=${shellEscape(v, shellType)}`).join(" && ")
      return `${assignments} &&`
    }
    default:
      throw new Error(`unknown shell type: ${shellType}`)
  }
}

/**
 * Pure mirror of the upstream tool.execute.before guard. Returns null when the
 * call is not bash or carries no string command. Otherwise:
 * - message: the exact upstream warning when a banned command matches
 * - command: git commands get the non-interactive env prefix (idempotent)
 */
export function applyNonInteractiveGuard({ tool, command }, { shellType = "unix" } = {}) {
  if (tool.toLowerCase() !== "bash") return null
  if (typeof command !== "string" || command.length === 0) return null
  const banned = detectBannedCommand(command)
  const message = banned
    ? `Warning: '${banned}' is an interactive command that may hang in non-interactive environments.`
    : undefined
  let next = command
  if (/\bgit\b/.test(command)) {
    const prefix = buildEnvPrefix(NON_INTERACTIVE_ENV, shellType)
    if (!command.trim().startsWith(prefix.trim())) next = `${prefix} ${command}`
  }
  return { message, command: next }
}
