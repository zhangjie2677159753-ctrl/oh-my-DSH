# ADR：R16 事件恢复限制 — 接受 Boulder 镜像 reconciliation 兜底

- 状态：**已接受（owner 授权签字，2026-08-17）**
- 决策者：owner（会话内明确授权"这些都授权给你完成"）
- 关联风险：R16（`docs/research/SOURCE-BASELINE.md` §5.6）

## 背景

DSH 固定 SHA `47f9438`：`Session.append` 不检查 `KNOWN_SESSION_EVENT_TYPES`，
但 persistence restore 拒绝含未知 type 且未标记 `ignorable` 的事件；append
无 ignorable 入口；out-of-repo 事件注册面尚未实现。因此含 `omo/role` 等
OMO 自定义事件的会话，live 阶段完全正常，但 stock harness 跨重启恢复会报
unsupported event type。

## 决策

接受**双层权威**方案：

1. **Session Log 为进程内权威**（live append + fold，已 20 项 live 证据验证）；
2. **Boulder 镜像为跨重启权威**：role/work 快照经文件仓储镜像
   （`packages/omo-dsh/src/boulder/repository.mjs`，原子写已测）；
3. **恢复时先试 Session Log**，被 DSH 拒绝时按镜像 reconciliation 恢复，
   并在 parity 矩阵记录该 deviation；
4. 继续跟踪 DSH 上游 event-type 注册面（P1），一旦开放即迁移为纯
   Session Log 恢复并撤销本兜底。

## 责任与失效条件

- 兜底路径的每次使用必须记录 `parity.json` deviation 计数；
- 镜像与日志冲突时日志胜（append-only 权威），偏差计入；
- 上游注册面开放后 90 天内完成迁移，否则本 ADR 自动复审。
- 跟踪记录：2026-08-17 检查 deepseek-ai/deepseek-harness 上游 HEAD =
  `47f9438…`（与固定基线一致，注册面未出现）——状态不变。
