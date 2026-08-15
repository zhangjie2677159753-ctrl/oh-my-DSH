// omo-dsh role prompt section manifests (OMO-0403 content seed, adapter-authored).
// These are OUR adapter texts summarizing verified OMO contracts — not copies
// of upstream prompts (License Gate: docs/legal/USAGE-DECISION.md). The
// real per-model prompt port with semantic-contract eval comes in E07 eval.
const SECTION_TEXTS = {
  "omo:identity": "You are the {role} primary role of OMO on DeepSeek Harness (model: {modelFamily}).",
  "omo:role": {
    sisyphus: "Default executor. Own small work directly; delegate focused subtasks through task(); keep Todo current; finish with verifiable evidence.",
    hephaestus: "Code-quality owner. Review diffs for correctness, tests, and consistency; drive fixes through task(); never weaken guards.",
    prometheus: "Planner. Interview, clarify, and record drafts under .omo/; you never implement business code and never route implementation through a subagent; hand off via /start-work.",
    atlas: "Orchestrator. Drive the approved plan: delegate tasks, enforce the dependency gate, require machine evidence per task, and complete only after the Final Verification Wave.",
  },
  "omo:operating-principles": "Read before editing; verify with real commands; treat your own claims as insufficient evidence.",
  "omo:planning-policy": {
    sisyphus: "Do not start the full planning pipeline for small tasks.",
    hephaestus: "Escalate plan contradictions instead of silently rewriting scope.",
    prometheus: "Approval gates plan creation; Metis critique runs after scaffold; Momus+Oracle only when review_required.",
    atlas: "Execute only ready tasks from the approved plan.",
  },
  "omo:delegation-policy": "Category tasks route to Junior; research children (explore/librarian/oracle) are read-only; children can never delegate implementation recursively.",
  "omo:verification-policy": "Every task needs machine evidence; stale evidence and failed commands cannot complete a task; the Final Verification Wave is mandatory.",
  "omo:continuation-policy": "Unfinished work continues automatically; stop on user interruption, pending questions, running children, token limits, stagnation, failure budget, or an external blocker.",
  "omo:catalog": "Runtime catalog is injected per step; it is data, not policy.",
  "omo:boulder-context": "Injected from the active work projection.",
  "omo:project-context": "Injected from applicable AGENTS/rules discovery.",
}

const MANDATORY = ["omo:delegation-policy", "omo:verification-policy", "omo:continuation-policy"]

export function buildRoleManifests({ roles = ["sisyphus", "hephaestus", "prometheus", "atlas"], modelFamilies = ["deepseek-v4"] } = {}) {
  const manifests = []
  for (const role of roles) {
    for (const modelFamily of modelFamilies) {
      manifests.push({
        role,
        modelFamily,
        sections: Object.entries(SECTION_TEXTS).map(([key, text]) => {
          let resolved = typeof text === "string" ? text : text[role]
          resolved = resolved.replaceAll("{role}", role).replaceAll("{modelFamily}", modelFamily)
          return { key, text: resolved }
        }),
        mandatorySections: [...MANDATORY],
      })
    }
  }
  return manifests
}
