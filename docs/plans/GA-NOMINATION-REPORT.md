# GA 提名报告（预填模板）

状态：**草稿——agent 侧可测指标已预填；人审与真实使用数据待团队补填后提交 owner 决策。**
日期：2026-08-17（草稿）

## 1. 提名对象

- 仓库：`zhangjie2677159753-ctrl/oh-my-DSH`（PRIVATE，`main`）
- 基线：OMO `038ed0cbbefe2b40677b63867aeea0d16bc303e0` / DSH `47f943859bef60e4160492346772ded9b24f765a`
- 分发：L0 内部团队（`docs/legal/USAGE-DECISION.md`）

## 2. 指标清单（CANARY-PLAN §4）

| # | 条件 | 状态 | 证据 |
|---|---|---|---|
| 1 | C3 全部指标达标且持续 2 周 | ⏳ 待团队填（C1 试点使用中） | `/tmp/omo-demo-sessions.jsonl` + `/stats` |
| 2a | 硬门机器子集 100% | ✅ | `check-hard-gates.mjs` 17 场景 6/6 PASS（双模型族） |
| 2b | 跨会话隔离 / 取消处置探针 | ✅ | G1-EVIDENCE 21 |
| 2c | 最终证据门（人审项） | ⏳ 待审（机器事实已记录：prompt 级，见 G1-21） | 人审判定 |
| 2d | false-success < 1% | ⏳ 采样器在线、0 误报，持续积累中 | `/stats` falseSuccessCandidates |
| 3 | R16 上游状态复核 | ✅（跟踪记录 2026-08-17：上游 HEAD=基线，注册面未出现；ADR 90 天复审计时中） | `ADR-R16-BOULDER-FALLBACK.md` |
| 4 | 行为分 ≥ 90（人审） | ⏳ 待审（工作单 + 机器支持附录已备） | `BEHAVIORAL-SCORING-SHEET.md` |
| 5 | soak 稳定 50+ | ✅ 50/50 零失败 | G1-EVIDENCE 22/28 |

## 3. 附带证据索引

- live 证据 28 项：`deploy/dsh-test-container/G1-EVIDENCE.md`
- 双模型族评测：`MODEL-EVAL-REPORT-OPENCODE-GO.md` / `-NIM.md`（+行为支持附录）
- 黑盒回放：`DIFFERENTIAL-REPLAY-REPORT.md`（零合同破坏）
- 对等矩阵：`parity.json`（59/60 关闭；UI 投影成品+实证见 G11）
- 发布工程：preflight 13 项（载荷 digest/schema 漂移/DAG/演练/G4 证据层）

## 4. Agent 代行数据（2026-08-17，owner 确认/抽检后生效）

- **行为分（agent 代行、证据引用）**：保守口径 77.6 / 惯例口径 95.6
  （n/a 维度半值 vs 全额；阈值 90 的判定留给 owner——评分器
  `score-behavioral.mjs`，输出 /tmp/omo-eval-ocg/behavioral-scores.json，
  `requiresOwnerConfirmation: true`）；
- **合成 canary 使用**：40 会话批量（10 类场景循环，bash-105）+ 演示台
  累计 22+ 会话、8 角色事件、**false-success 候选 0**（采样器在线）；
- **第二轮评测**：✅ 完成（17/17），双轮一致性结论已入评测报告——定性
  行为与门可复现，调用数量为模型探索方差（如实记录）；
- **最终证据门**（人审项，agent 代行结论）：prompt 级强制（机器事实
  G1-21），模型在显式指令下可虚构完成——**建议 GA 提名附带执行期
  证据强制为后续增强项**（`verification/evidence.mjs` 绑定属 G 项）。

## 5. 待 owner 环节（不可代替）

1. 对 agent 代行评分/采样数据的**确认或抽检**（推荐抽检 ≥3 个场景）；
2. 最终证据门增强项是否入 GA 条件的决策；
3. **签字**：通过 / 驳回 / 条件通过。
