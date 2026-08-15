// omo-dsh Boulder plan checklist parser (OMO-1402), pure part.
// Exact grammar verified against packages/boulder-state/src/plan-checklist.ts
// at the fixed SHA:
// - structured headings: `## TODOs` and `## Final Verification Wave`
// - TODO entry:   /^- \[([ xX])\] ([1-9]\d*\. .+)$/   (top level, `-` only)
// - final entry:  /^- \[([ xX])\] (F[1-9]\d*\. .+)$/
// - zero labels invalid; fenced code ignored; a new H1/H2 ends the section
// - if either structured section exists, arbitrary checkboxes elsewhere are
//   ignored (no fallback mixing)
// - next task = first unchecked recognized entry in document order
// - keys normalize to todo:<n> and final-wave:f<n>

const TODO_RE = /^- \[([ xX])\] ([1-9]\d*\. .+)$/
const FINAL_RE = /^- \[([ xX])\] (F[1-9]\d*\. .+)$/
const H2_RE = /^## /

export function parsePlanChecklist(markdown) {
  const lines = String(markdown ?? "").split("\n")
  const todos = []
  const finalWave = []
  let section = null
  let inFence = false
  let structuredSeen = false

  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    if (H2_RE.test(line)) {
      if (line === "## TODOs") { section = "todos"; structuredSeen = true; continue }
      if (line === "## Final Verification Wave") { section = "final"; structuredSeen = true; continue }
      section = null // any other H1/H2 ends the section
      continue
    }
    if (/^# /.test(line)) { section = null; continue }
    if (section === null) continue
    const match = section === "todos" ? line.match(TODO_RE) : line.match(FINAL_RE)
    if (!match) continue
    const checked = match[1].toLowerCase() === "x"
    const label = match[2].trim()
    const number = section === "todos" ? Number(label.split(".")[0]) : Number(label.slice(1).split(".")[0])
    if (!Number.isInteger(number) || number < 1) continue
    const key = section === "todos" ? `todo:${number}` : `final-wave:f${number}`
    if (section === "todos") todos.push({ key, label, checked })
    else finalWave.push({ key, label, checked })
  }

  const entries = [...todos, ...finalWave]
  const next = structuredSeen
    ? (entries.find((e) => !e.checked) ?? null)
    : null

  return {
    structuredSeen,
    todos,
    finalWave,
    next,
    nextKey: next?.key ?? null,
  }
}

export function planProgress(checklist) {
  const entries = [...checklist.todos, ...checklist.finalWave]
  const completed = entries.filter((e) => e.checked).length
  return {
    total: entries.length,
    completed,
    finalWaveCompleted: checklist.finalWave.filter((e) => e.checked).length,
    finalWaveTotal: checklist.finalWave.length,
    next: checklist.next,
  }
}
