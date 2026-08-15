# GA 差距分析（2026-08-16，goal round 16 收口）

本文件回答一个诚实问题：**距离"按 Conformance Profiles 达到 GA 发布门"还差什么**。
当前状态是可运行的合同级核心 + 受控容器集成证据；GA 尚远，按优先级列出差距。

## 已达成（证据见各文件）

1. 治理：License L0（内部/私有）、上游锁、基线 tag、默认分支 main；
2. 机器文件：parity.json、task-dag.json（122 任务）、包分类、hook 清单 56/58/4、compat 合同 35 项、eval-corpus（17 E2E + 15 模型矩阵 + 9 hard gate + 10 评分）；
3. 纯逻辑层：41 个模块、229 项测试全绿、g1-preflight PASSED；
4. DSH 集成（容器）：镜像按固定 SHA 构建；web boot 200；preset discovery healthy；`omo_role`/`omo_role_status` 插件模块加载成功；
5. 权限真源纠偏：tool-config-handler 运行时层全覆盖（六子代理 task:deny、Prometheus bash:deny、Junior legacy 委派路径）。

## 差距清单（按阻塞优先级）

### P0 — 发布阻断

| # | 差距 | 需要什么 |
|---|---|---|
| G1 | 真实 Session 级 mount/lifecycle 验证 | 带凭据的会话或 UI/API 通道（Playwright 后端无法访问本机 loopback）；检查单已备 |
| G2 | R16：DSH persistence restore 拒绝未知非 ignorable 事件 | 上游 event-type 注册面；此前 Boulder 镜像 reconciliation 兜底 |
| G3 | 模型评测 0 次执行 | 部署凭据 + eval-corpus 执行（17 E2E 场景起） |
| G4 | 与上游的 differential 回放仅合同级 | 固定 SHA 双端黑盒回放（需 OpenCode/Senpi 可运行环境） |

### P1 — 行为闭包

| # | 差距 | 需要什么 |
|---|---|---|
| G5 | Hook 三清单锁定但 DSH 行为绑定仅 role 两个工具 | E22 逐行绑定（56 configurable / 58 constructed） |
| G6 | Prompt section 未接入 DSH 运行时 | E04 插件把 manifests/guard 挂到 session/prompt 服务 |
| G7 | `task()` 只是纯规范化，无 DSH child 实调 | E09-E11 DSH 绑定 + continuable/Job 生命周期实测 |
| G8 | Boulder 文件仓储未接真实工作目录 | E14 宿主绑定 + 崩溃注入 |
| G9 | Continuation 决策器未挂 turn-stopping | E17 DSH 事件绑定 |

### P2 — 完整能力与发布工程

| # | 差距 | 需要什么 |
|---|---|---|
| G10 | Memory/Team/OpenClaw/Monitor 仅策略纯逻辑 | Host 服务绑定 |
| G11 | UI 投影未注册 Slot | 实现时 Inspect 实时 Slot 合同 |
| G12 | 迁移/回滚仅 dry-run 与状态机 | 真机演练（E29/E31） |
| G13 | 包发布：packed payload、干净消费者、schema freshness fail-on-diff | E30 发布流水线 |
| G14 | canary/GA 门：hard gates 100%、模型族 ≥90%、false-success <1%、soak | E28 评测 + RG7/RG9 |

## 下一步行动（owner 决策优先）

1. 提供受控测试凭据或 UI/API 通道 → 解除 G1/G3；
2. 对 R16 跟踪 DSH 上游（或接受 Boulder 镜像方案并签字）；
3. 按 task-dag 继续 E04/E09/E14/E17 的 DSH 绑定；
4. E22 hook 逐行关闭 + E28 评测执行；
5. E29-E31 迁移/发布/回滚演练后进入 canary。

## 完整性声明

- 本仓库只声明"合同级实现 + 容器级集成证据"，不宣称 GA；
- `parity.json` 的 `contract-implemented` 状态明确区别于 `implemented`（DSH 运行时绑定验证）；
- 所有未完成的 DAG 任务保持 `not-started`/`partial`，不会被平均值掩盖。
