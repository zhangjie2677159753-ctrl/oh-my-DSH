import { test } from "node:test"
import assert from "node:assert/strict"
import {
  NON_INTERACTIVE_ENV,
  BANNED_COMMANDS,
  detectBannedCommand,
  buildEnvPrefix,
  applyNonInteractiveGuard,
} from "../src/guards/non-interactive.mjs"

test("banned list locked to upstream 11 entries", () => {
  assert.equal(BANNED_COMMANDS.length, 11)
  assert.deepEqual(BANNED_COMMANDS.slice(0, 4), ["vim", "nano", "vi", "emacs"])
  assert.ok(BANNED_COMMANDS.includes("python (REPL)"))
  assert.ok(BANNED_COMMANDS.includes("git rebase -i"))
})

test("detectBannedCommand matches word-bounded editors and pagers", () => {
  assert.equal(detectBannedCommand("vim file.txt"), "vim")
  assert.equal(detectBannedCommand("nano /etc/hosts"), "nano")
  assert.equal(detectBannedCommand("man ls"), "man")
  assert.equal(detectBannedCommand("less README.md"), "less")
})

test("detectBannedCommand honors word boundaries", () => {
  assert.equal(detectBannedCommand("vimming"), null)
  assert.equal(detectBannedCommand("git status"), null)
})

test("REPL entries are excluded exactly like upstream (no bare python/node match)", () => {
  assert.equal(detectBannedCommand("python"), null)
  assert.equal(detectBannedCommand("python -c 'print(1)'"), null)
  assert.equal(detectBannedCommand("node --version"), null)
})

test("interactive git modes match with intent-correct names (upstream misalignment fixed)", () => {
  // Upstream returns banned[i] with the FILTERED index, so `git add -p` (i=7)
  // reports "python (REPL)". omo-dsh reports the matched command itself.
  assert.equal(detectBannedCommand("git add -p"), "git add -p")
  assert.equal(detectBannedCommand("git rebase -i"), "git rebase -i")
})

test("buildEnvPrefix unix: single, multiple, escaping, empty value", () => {
  assert.equal(buildEnvPrefix({ VAR: "value" }, "unix"), "export VAR=value;")
  assert.equal(buildEnvPrefix({ VAR1: "val1", VAR2: "val2" }, "unix"), "export VAR1=val1 VAR2=val2;")
  assert.equal(buildEnvPrefix({ MSG: "has spaces" }, "unix"), "export MSG='has spaces';")
  assert.equal(buildEnvPrefix({ V: "" }, "unix"), "export V='';")
  assert.equal(buildEnvPrefix({}, "unix"), "")
})

test("buildEnvPrefix powershell: single, multiple, quote escaping", () => {
  assert.equal(buildEnvPrefix({ VAR: "value" }, "powershell"), "$env:VAR='value';")
  assert.equal(
    buildEnvPrefix({ VAR1: "val1", VAR2: "val2" }, "powershell"),
    "$env:VAR1='val1'; $env:VAR2='val2';",
  )
  assert.equal(buildEnvPrefix({ MSG: "it's working" }, "powershell"), "$env:MSG='it''s working';")
})

test("buildEnvPrefix cmd: single and chained set", () => {
  assert.equal(buildEnvPrefix({ VAR: "value" }, "cmd"), 'set VAR="value" &&')
  assert.equal(
    buildEnvPrefix({ VAR1: "val1", VAR2: "val2" }, "cmd"),
    'set VAR1="val1" && set VAR2="val2" &&',
  )
})

test("buildEnvPrefix csh and unknown shell", () => {
  assert.equal(buildEnvPrefix({ VAR: "value" }, "csh"), "setenv VAR value;")
  assert.throws(() => buildEnvPrefix({ VAR: "x" }, "fish"), /unknown shell type/)
})

test("NON_INTERACTIVE_ENV unix prefix matches the upstream table exactly", () => {
  const prefix = buildEnvPrefix(NON_INTERACTIVE_ENV, "unix")
  assert.equal(
    prefix,
    "export CI=true DEBIAN_FRONTEND=noninteractive GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never " +
      "HOMEBREW_NO_AUTO_UPDATE=1 GIT_EDITOR=: EDITOR=: VISUAL='' GIT_SEQUENCE_EDITOR=: " +
      "GIT_MERGE_AUTOEDIT=no GIT_PAGER=cat PAGER=cat npm_config_yes=true PIP_NO_INPUT=1 " +
      "YARN_ENABLE_IMMUTABLE_INSTALLS=false;",
  )
})

test("applyNonInteractiveGuard ignores non-bash tools and non-string commands", () => {
  assert.equal(applyNonInteractiveGuard({ tool: "interactive_bash", command: "vim" }), null)
  assert.equal(applyNonInteractiveGuard({ tool: "bash", command: undefined }), null)
  assert.equal(applyNonInteractiveGuard({ tool: "bash", command: "" }), null)
})

test("applyNonInteractiveGuard sets the exact upstream warning text", () => {
  const r = applyNonInteractiveGuard({ tool: "bash", command: "vim x" })
  assert.equal(
    r.message,
    "Warning: 'vim' is an interactive command that may hang in non-interactive environments.",
  )
  assert.equal(r.command, "vim x")
})

test("applyNonInteractiveGuard is case-insensitive on tool name like upstream", () => {
  const r = applyNonInteractiveGuard({ tool: "Bash", command: "nano y" })
  assert.equal(r.message.includes("'nano'"), true)
})

test("applyNonInteractiveGuard prepends env prefix only for git commands", () => {
  const plain = applyNonInteractiveGuard({ tool: "bash", command: "ls -la" })
  assert.equal(plain.message, undefined)
  assert.equal(plain.command, "ls -la")

  const git = applyNonInteractiveGuard({ tool: "bash", command: "git status" })
  assert.equal(git.message, undefined)
  assert.ok(git.command.startsWith("export CI=true DEBIAN_FRONTEND=noninteractive"))
  assert.ok(git.command.endsWith(" git status"))
})

test("applyNonInteractiveGuard git prefix is idempotent", () => {
  const once = applyNonInteractiveGuard({ tool: "bash", command: "git log" })
  const twice = applyNonInteractiveGuard({ tool: "bash", command: once.command })
  assert.equal(twice.command, once.command)
})

test("applyNonInteractiveGuard supports powershell/csh/cmd prefixes for git", () => {
  const pwsh = applyNonInteractiveGuard({ tool: "bash", command: "git push" }, { shellType: "powershell" })
  assert.ok(pwsh.command.startsWith("$env:CI='true';"))
  const cmd = applyNonInteractiveGuard({ tool: "bash", command: "git push" }, { shellType: "cmd" })
  assert.ok(cmd.command.startsWith('set CI="true" &&'))
})
