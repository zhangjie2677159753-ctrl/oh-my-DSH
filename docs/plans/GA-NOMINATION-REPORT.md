# GA 提名报告（Owner 已裁决：完全通过）

状态：**✅ 完全通过（Owner 签字，2026-08-17）——六项验收条件全部关闭；项目进入 GA 提名就绪，剩余为团队真实使用数据积累（非工程工作）。**
日期：2026-08-17

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

## 5. Owner 裁决记录（2026-08-17，六项全过）

| 条件 | 裁决 | 内容 |
|---|---|---|
| C-1 行为分人审 | ✅ | Owner 以"适用维度加权"重算：**95.6% 通过**（替代两个 AI 自评分数） |
| C-2 证据门增强 | ✅ DEFER | 纯逻辑+测试完备、架构就绪未接线；prompt 级+采样器对内部 canary 够用；**要求 C3 结束前出设计 PR** → 已交付 `DESIGN-EVIDENCE-GATE.md` |
| C-3 Canary 授权 | ✅ | C1 立即启动；C2/C3 按退出标准自动推进，无需再审批；51 合成会话 + 50/50 soak 达标 |
| C-4 False-success | ✅ | 51+ 会话 / 0 误报 = 0% < 1% 阈值；采样器持续监控 |
| C-5 R16 ADR 复审 | ✅ | ADR 有效、90 天计时未触发；**2026-11-15 季度强制复查点**已设 |
| C-6 Owner 签字 | ✅ | 从"条件通过"升级为**完全通过** |

**GA 提名就绪**；提名本身（真实使用数据积累）是团队活动。
