# OMO for DSH

`oh-my-DSH` 是 **Oh My OpenAgent（OMO）在 DeepSeek Harness（DSH）上的完整行为对等迁移计划与后续实现仓库**。

本仓库当前阶段只交付经过源码核验的实施蓝图，不伪装成已经完成的适配器。目标不是“借鉴 OMO 做一个相似插件”，而是在固定上游基线下迁移 OMO 的角色、行为、状态机、权限、恢复语义和验收合同，同时使用 DSH 原生 Session、Subagent、Tool、Prompt、Persistence、Compaction、Goal 与 UI 扩展能力承载它们。

## 基线

| 项目 | 固定版本 |
|---|---|
| OMO | `code-yeongyu/oh-my-openagent@038ed0cbbefe2b40677b63867aeea0d16bc303e0`（`dev`，`5.0.0-beta.7`） |
| DSH | `deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`（`0.1.0-rc.5`） |
| OMO 许可证 | `SUL-1.0`，实施前必须完成使用/分发场景审查 |
| DSH 许可证 | MIT；Developer Preview，必须通过兼容层隔离变动 |

## 最终产品形态

```text
完整 OMO 产品语义
+ OMO Harness-neutral Core
+ packages/omo-dsh 适配器
+ 单一 OMO Agent Preset
+ 同一父 Session 内可持久切换的四个 Primary Role
+ 独立、可控、可恢复的 DSH 子 Session
+ Boulder / Session Log / Todo 三层状态
+ 机器验证与独立验收门
```

四个主角色：Sisyphus、Hephaestus、Prometheus、Atlas。子角色：Explore、Librarian、Oracle、Metis、Momus、Multimodal-Looker、Sisyphus-Junior，以及内部 Plan-Compiler。

## 文档入口

1. [`docs/research/SOURCE-BASELINE.md`](docs/research/SOURCE-BASELINE.md)：固定源码基线、已核验事实、提案修正与许可证门。
2. [`docs/architecture/TARGET-ARCHITECTURE.md`](docs/architecture/TARGET-ARCHITECTURE.md)：Host/Agent 两平面、日志化角色、统一 `task()`、状态与安全边界。
3. [`docs/plans/MASTER-IMPLEMENTATION-PLAN.md`](docs/plans/MASTER-IMPLEMENTATION-PLAN.md)：分阶段、分 Epic、分任务的主实施计划。
4. [`docs/plans/PARITY-MATRIX.md`](docs/plans/PARITY-MATRIX.md)：能力域、56 个公开 Hook 配置名及内部/组合 Hook、OMO→DSH 处置和追踪规则。
5. [`docs/plans/ACCEPTANCE-AND-EVALUATION.md`](docs/plans/ACCEPTANCE-AND-EVALUATION.md)：合同测试、集成/回放/故障注入、真实模型评测和发布门。
6. [`docs/plans/DEEPSEEK-EXECUTION-HANDOFF.md`](docs/plans/DEEPSEEK-EXECUTION-HANDOFF.md)：交给 DeepSeek 执行时的批次、停止条件、提交纪律与证据格式。

## 三条不可妥协原则

1. **源码真源优先级**：固定 revision 的现行源码 > 现行测试 > 行为回放 > 生成的 `AGENTS.md` > 普通文档；发生冲突必须记录，不得默选 README。
2. **行为对等而非文件对等**：可以把 56 个公开 Hook 配置项与内部/组合 Hook 合并成更少 DSH 组件，但每一个行为合同都必须在矩阵中有实现、原生替代、明确偏差或阻塞结论。
3. **硬约束不靠 Prompt**：角色权限、Atlas 完成门、递归深度、计划写入、证据与续跑停止条件必须由代码和状态机执行；Prompt 只表达同一合同。

## 当前状态

- [x] 固定 OMO 与 DSH 源码 revision。
- [x] 核验 DSH 关键扩展 API 与限制。
- [x] 核验 OMO Core 数量、`/start-work`、Boulder、`task()`、Atlas/Junior 权限和续跑常量。
- [x] 建立详细实施、验收和移交文档。
- [ ] 完成 OMO SUL-1.0 法务/使用场景决策。
- [ ] 在 OMO Monorepo 创建 `packages/omo-dsh/` 实现。
- [ ] 达到最终行为对等发布门。

> 注意：本仓库不保存 API Token、密码或带凭据的远端 URL。任何在聊天、Issue 或日志中公开过的令牌都应立即撤销并重新签发。
