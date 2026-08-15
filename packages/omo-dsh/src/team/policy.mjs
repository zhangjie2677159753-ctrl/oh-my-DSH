// omo-dsh team policy (E24), pure part.
// - TeamRun persists the ACTUAL roster snapshot; dispatch/barrier/cleanup
//   iterate the roster — never a hardcoded five-name list
// - workflow cardinality: hyperplan allows 4 (researcher dropped) or 5;
//   security-research requires exactly 5 with replacement (never 4)
// - mailbox: only roster members can send; non-members are rejected
// - shutdown drains every member and leaves no orphans
export function validateTeamRoster({ workflow, members }) {
  const errors = []
  const names = members.map((m) => m.name)
  const unique = new Set(names)
  if (unique.size !== names.length) errors.push("member names must be unique")
  if (members.length === 0) errors.push("team needs at least one member")
  if (workflow === "hyperplan") {
    const required = ["skeptic", "validator", "architect", "creative"]
    const missing = required.filter((r) => !unique.has(r))
    if (missing.length > 0) errors.push(`hyperplan requires ${missing.join(", ")}`)
    if (members.length > 5) errors.push("hyperplan max 5 members")
    if (members.length === 4 && unique.has("researcher")) errors.push("hyperplan 4-member degraded roster must drop researcher")
  }
  if (workflow === "security-research") {
    if (members.length !== 5) errors.push("security-research must never fall below 5 members (replace unavailable categories)")
  }
  return errors
}

export function createTeamRun({ workflow, members }) {
  const errors = validateTeamRoster({ workflow, members })
  if (errors.length > 0) throw new TypeError(errors.join("; "))
  const roster = members.map((m) => Object.freeze({ ...m }))
  const mailboxes = new Map(members.map((m) => [m.name, []]))
  return {
    workflow,
    roster,
    size: roster.length,
    send({ from, to, content }) {
      if (!mailboxes.has(from)) throw new Error(`sender ${from} not in roster`)
      if (!mailboxes.has(to)) throw new Error(`recipient ${to} not in roster (plan agent is NOT a team member)`)
      mailboxes.get(to).push(Object.freeze({ from, to, content, at: Date.now() }))
      return { delivered: true, to }
    },
    inbox(name) {
      return mailboxes.get(name) ?? null
    },
    shutdown() {
      const drained = []
      for (const name of mailboxes.keys()) {
        drained.push({ name, remaining: mailboxes.get(name).length })
        mailboxes.set(name, [])
      }
      return { drained: drained.length, members: drained, orphans: 0 }
    },
  }
}

export function createWorktreeLeases() {
  const holders = new Map()
  return {
    acquire(worktree, writerId) {
      if (holders.has(worktree)) {
        return { granted: false, holder: holders.get(worktree) }
      }
      holders.set(worktree, writerId)
      return { granted: true, holder: writerId }
    },
    release(worktree, writerId) {
      if (holders.get(worktree) !== writerId) {
        throw new Error(`worktree ${worktree} held by ${holders.get(worktree)}, not ${writerId}`)
      }
      holders.delete(worktree)
      return { released: true }
    },
    holders: () => Object.fromEntries(holders),
  }
}
