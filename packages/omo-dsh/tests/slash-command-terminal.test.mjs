import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MissingCommandSessionIDError,
  skillToCommandInfo,
  substituteCommandTemplate,
  formatCommandTemplate,
  executeSlashCommand,
  detectSlashCommand,
  EXCLUDED_COMMANDS,
} from "../src/skills/slash-command.mjs"
import { buildSessionReminderMessage, terminalSessionReminder, OMO_SESSION_PREFIX } from "../src/compat/terminal.mjs"

// --- detector ---

test("detectSlashCommand parses /name args and lowercases the command", () => {
  assert.deepEqual(detectSlashCommand("/Omp-Plan do the thing"), {
    command: "omp-plan",
    args: "do the thing",
    raw: "/Omp-Plan do the thing",
  })
  assert.deepEqual(detectSlashCommand("/status"), { command: "status", args: "", raw: "/status" })
})

test("detectSlashCommand skips fenced code blocks and excluded commands", () => {
  assert.equal(detectSlashCommand("```\n/ralph-loop x\n```"), null)
  for (const excluded of EXCLUDED_COMMANDS) {
    assert.equal(detectSlashCommand(`/${excluded} args`), null)
  }
  assert.equal(detectSlashCommand("not a slash"), null)
  assert.equal(detectSlashCommand(""), null)
})

// --- template variables ---

test("substituteCommandTemplate substitutes all four variables", () => {
  const fixedNow = () => new Date("2026-08-16T00:00:00.000Z")
  const out = substituteCommandTemplate(
    "user=${user_message} args=$ARGUMENTS sid=$SESSION_ID ts=$TIMESTAMP",
    "hello",
    "sess-1",
    fixedNow,
  )
  assert.equal(out, "user=hello args=hello sid=sess-1 ts=2026-08-16T00:00:00.000Z")
})

test("substituteCommandTemplate throws when $SESSION_ID is used without a session id", () => {
  assert.throws(() => substituteCommandTemplate("sid=$SESSION_ID", "", undefined), MissingCommandSessionIDError)
  assert.equal(substituteCommandTemplate("no vars here", "", undefined), "no vars here")
})

// --- full template ---

test("formatCommandTemplate renders sections in upstream order with args section", () => {
  const cmd = {
    name: "omp-plan",
    scope: "skill",
    metadata: { description: "Build a plan", model: "m1", agent: "prometheus" },
    content: "Use $ARGUMENTS",
  }
  return formatCommandTemplate(cmd, "ship it", "sess-9").then((r) => {
    assert.equal(r.ok, true)
    const lines = r.replacementText.split("\n")
    assert.equal(lines[0], "# /omp-plan Command")
    assert.equal(lines[2], "**Description**: Build a plan")
    assert.equal(lines[4], "**User Arguments**: ship it")
    assert.equal(lines[6], "**Model**: m1")
    assert.equal(lines[8], "**Agent**: prometheus")
    assert.equal(lines[10], "**Scope**: skill")
    assert.equal(lines[12], "---")
    assert.equal(lines[14], "## Command Instructions")
    assert.equal(lines[16], "Use ship it")
    // args present but $ARGUMENTS referenced -> NO User Request section
    assert.equal(r.replacementText.includes("## User Request"), false)
  })
})

test("formatCommandTemplate appends User Request only when args un-referenced", () => {
  const cmd = {
    name: "status",
    scope: "builtin",
    metadata: { description: "" },
    content: "show status",
  }
  return formatCommandTemplate(cmd, "extra words", "sess-9").then((r) => {
    assert.ok(r.replacementText.includes("## User Request\n\nextra words"))
  })
})

test("formatCommandTemplate loads lazy content when content is empty", () => {
  const cmd = {
    name: "lazy",
    scope: "skill",
    metadata: { description: "lazy" },
    content: "",
    lazyContentLoader: { load: async () => "lazy body" },
  }
  return formatCommandTemplate(cmd, "", "sess-9").then((r) => {
    assert.ok(r.replacementText.includes("lazy body"))
  })
})

// --- executor ---

test("executeSlashCommand: not found and agent restriction errors are exact", () => {
  return executeSlashCommand({ command: "nope", args: "" }, { commands: [] }).then((r) => {
    assert.equal(r.success, false)
    assert.equal(r.error, "Command \"/nope\" not found. Use the skill tool to list available skills and commands.")
  })
})

test("executeSlashCommand rejects skill restricted to another agent", () => {
  const skillCmd = {
    name: "prom-only",
    scope: "skill",
    metadata: { agent: "prometheus" },
    content: "x",
  }
  return executeSlashCommand({ command: "prom-only", args: "" }, {
    commands: [skillCmd],
    agent: "sisyphus",
  }).then((r) => {
    assert.equal(r.success, false)
    assert.equal(r.error, 'Skill "prom-only" is restricted to agent "prometheus"')
  })
})

test("executeSlashCommand succeeds for matching agent and skill-precedence order", () => {
  const skillCmd = { name: "dup", scope: "skill", metadata: {}, content: "skill body" }
  const builtinCmd = { name: "dup", scope: "builtin", metadata: {}, content: "builtin body" }
  return executeSlashCommand({ command: "DUP", args: "" }, {
    commands: [skillCmd, builtinCmd],
    sessionID: "sess-1",
  }).then((r) => {
    assert.equal(r.success, true)
    assert.ok(r.replacementText.includes("skill body"))
    assert.ok(!r.replacementText.includes("builtin body"))
  })
})

test("executeSlashCommand wraps load failures in the upstream message", () => {
  const cmd = {
    name: "boom",
    scope: "skill",
    metadata: {},
    content: "sid=$SESSION_ID", // missing sessionID -> MissingCommandSessionIDError
  }
  return executeSlashCommand({ command: "boom", args: "" }, { commands: [cmd] }).then((r) => {
    assert.equal(r.success, false)
    assert.equal(r.error, "Failed to load command \"/boom\": Command template requires a session ID")
  })
})

test("skillToCommandInfo maps definition fields and template content", () => {
  const info = skillToCommandInfo({
    name: "omp-skill",
    path: "/x/SKILL.md",
    definition: { description: "d", template: "t", agent: "atlas", model: "m" },
  })
  assert.equal(info.scope, "skill")
  assert.equal(info.content, "t")
  assert.equal(info.metadata.description, "d")
  assert.equal(info.metadata.agent, "atlas")
})

// --- terminal reminder (P4) ---

test("buildSessionReminderMessage matches the upstream format exactly", () => {
  assert.equal(buildSessionReminderMessage([]), "")
  assert.equal(
    buildSessionReminderMessage(["omo-main", "omo-gdb"]),
    "\n\n[System Reminder] Active omo-* tmux sessions: omo-main, omo-gdb",
  )
})

test("terminalSessionReminder projects only omo-prefixed named sessions", () => {
  assert.equal(OMO_SESSION_PREFIX, "omo-")
  assert.equal(terminalSessionReminder([]), null)
  assert.equal(terminalSessionReminder([{ name: "main" }]), null)
  const r = terminalSessionReminder([{ name: "omo-main" }, { name: "scratch" }])
  assert.deepEqual(r.sessions, ["omo-main"])
  assert.ok(r.message.includes("omo-main"))
})
