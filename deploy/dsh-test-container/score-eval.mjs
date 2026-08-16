#!/usr/bin/env node
// Score one eval batch: reads EVAL_OUT summary.json and emits
// docs/plans/MODEL-EVAL-REPORT.md (per-scenario table + honest totals +
// machine hard-gate results). Usage: node score-eval.mjs [summary.json] [output.md]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const [summaryFile = '/tmp/omo-eval/summary.json', outFile = join(here, '..', '..', 'docs', 'plans', 'MODEL-EVAL-REPORT.md')] = process.argv.slice(2)

const rows = JSON.parse(readFileSync(summaryFile, 'utf8'))
const model = process.env.DSH_TEST_MODEL ?? 'openai/gpt-oss-120b'

const lines = [
  `# Model Eval Report（NIM ${model}）`,
  '',
  `生成时间：${new Date().toISOString()}`,
  `证据目录：/tmp/omo-eval（transcript + session.jsonl 每场景一份）`,
  '',
  '## 机器指标',
  '',
  '| 场景 | 工具调用 | 工具名 | 角色事件 | 助手回合 | 时长(s) | 转录长度 |',
  '|---|---|---|---|---|---|---|',
]
let totalCalls = 0
let roleSwitches = 0
let assistantTurns = 0
for (const row of rows) {
  totalCalls += row.toolCalls
  roleSwitches += row.roleEvents.length
  assistantTurns += row.assistantTurns
  lines.push(`| ${row.id} | ${row.toolCalls} | ${(row.toolNames ?? []).join(', ') || '—'} | ${row.roleEvents.length} | ${row.assistantTurns} | ${row.seconds} | ${row.transcriptLength} |`)
}
lines.push('', '## 汇总', '', `- 场景数：${rows.length}`)
lines.push(`- 总工具调用：${totalCalls}`)
lines.push(`- 角色切换事件：${roleSwitches}`)
lines.push(`- 助手回合总数：${assistantTurns}`)
lines.push('', '## Hard Gates（机器可测子集）', '')
try {
  const evaldir = join(dirname(summaryFile))
  const gateOut = execFileSync(process.execPath, [join(here, '..', '..', 'tools', 'check-hard-gates.mjs'), evaldir], { encoding: 'utf8' })
  lines.push('```text')
  lines.push(gateOut.trim())
  lines.push('```')
} catch (err) {
  lines.push(`hard-gate checker failed: ${err.message}`)
}
lines.push('', '## 诚实边界', '')
lines.push('- 本报告只呈现机器可测指标；行为分（角色忠实/正确委派/完成质量）需要人工或 checker 逐场景判定；')
lines.push('- 模型在 NIM 上的可用性/延迟本身是评测变量，不作为 OMO 适配器缺陷；')
lines.push('- false-success 与 4 项 non-machine-checkable gate（跨会话隔离/最终证据/取消处置/人审项）不在此表宣称。')
lines.push('')
writeFileSync(outFile, lines.join('\n'))
console.log(`report written: ${outFile}`)
