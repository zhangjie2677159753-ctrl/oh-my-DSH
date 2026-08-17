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

## 4. 待团队补填项（模板）

- C1/C2/C3 阶段起止日期与参与人数；
- 人审行为分汇总（评分工作单 10 维度加权和）；
- 最终证据门人审结论；
- false-success 采样审计结论（采样数/命中数）；
- 提名决定：owner 签字（通过/驳回/条件通过）。
