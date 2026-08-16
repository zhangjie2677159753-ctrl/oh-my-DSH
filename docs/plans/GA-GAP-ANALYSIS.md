# GA 差距分析（2026-08-16 更新，goal round 30 收口）

本文件回答一个诚实问题：**距离"按 Conformance Profiles 达到 GA 发布门"还差什么**。
当前状态：合同级核心（60 模块 / 331 测试）+ 受控容器集成证据（含真实模型会话
live 证据）+ 评测执行中。GA 仍未达成，差距按优先级列出。

## 已达成（证据见各文件）

1. 治理：License L0（内部/私有）、上游锁、基线 tag、默认分支 main；
2. 机器文件：parity.json（60 行）、task-dag.json（122 任务）、包分类、hook
   清单 56/58/4、compat 合同 35 项（20 实现/15 未启动，逐项证据）、
   eval-corpus（17 E2E + 15 模型矩阵 + 9 hard gate + 10 评分）；
3. 纯逻辑层：**60 模块、331 测试全绿**、g1-preflight 9 项全过（含 E30 载荷门 +
   E29/E31 演练）；
4. DSH 集成（容器）：镜像按固定 SHA 构建；web boot 200；preset discovery
   healthy；session 级 mount（headless 测试镜像）；`omo_role` 工具 + 守卫瀑布 +
   `omo:identity` 身份段加载；**真实模型 live 证据**：角色切换事件、prometheus
   bash-deny 拒执（`G1-EVIDENCE.md` 12/13 条）；
5. 权限真源纠偏：tool-config-handler 运行时层全覆盖（六子代理 task:deny、
   Prometheus bash:deny、Junior legacy 委派路径）；
6. E22 五项 native-equivalent 等价证明主体 + 5 个 compat 补丁模块
   （`NATIVE-EQUIVALENCE-PROOFS.md`）；G6/G7 纯逻辑补齐（动态角色段构建器、
   task 控制面/编排）；G10 四份宿主绑定规格；E28 机器硬门检查器；E29-E31
   演练脚本跑通 + E30 载荷 digest 门；评测后处理管线（summary 重建/评分/硬门）
   端到端测过。

## 差距清单（按阻塞优先级）

### P0 — 发布阻断

| # | 差距 | 需要什么 |
|---|---|---|
| G1' | Session 级 mount/lifecycle 的**完整矩阵**验证 | 已在 headless 测试镜像达成核心路径（mount+工具+守卫+角色切换）；剩余：双 Session、flush 生命周期、child spawn/stop/resume 资源计数（G1-EVIDENCE "仍未执行" 节） |
| G2 | R16：DSH persistence restore 拒绝未知非 ignorable 事件 | 上游 event-type 注册面未开放；Boulder 镜像 reconciliation 兜底已实现并测试；需 owner 对兜底方案签字或上游解除 |
| G3 | 模型评测执行中（E2E-02 完成，共 17 场景 × ~25 分钟/场景） | 跑完全部 17 场景 → summary 重建 → score-eval + 硬门报告 → MODEL-EVAL-REPORT |
| G4 | 与上游的 differential 回放仅设计完成 | `DIFFERENTIAL-REPLAY-PLAN.md`；需 OpenCode/Senpi 可运行环境才能执行 |

### P1 — 行为闭包（纯逻辑已闭，运行时绑定待容器验证）

| # | 差距 | 需要什么 |
|---|---|---|
| G5' | E22 live 检查单（P1-P5 共 19 项）未勾 | 容器 session 级验证回填 Live Evidence（等价证明文档已备） |
| G6' | 动态角色段仅内容层 | 插件在角色事件后注册/更新 current-role/guard-status/work 段（镜像重建 + 容器验证） |
| G7' | task() 纯逻辑闭（控制面+编排+预算） | DSH child 实调 + Job/continuable 生命周期实测（E09-E11 live） |
| G8 | Boulder 文件仓储未接真实工作目录 | E14 宿主绑定 + 崩溃注入（规格已备 `boulder/DSH-BINDING.md`） |
| G9 | Continuation 决策器未挂 turn-stopping | E17 DSH 事件绑定（规格已备 `continuation/DSH-BINDING.md`） |

### P2 — 完整能力与发布工程

| # | 差距 | 需要什么 |
|---|---|---|
| G10' | Memory/Team/OpenClaw/Monitor 绑定规格已备 | Host 服务绑定实现 + 容器验收（四份 `DSH-BINDING.md`） |
| G11 | UI 投影未注册 Slot | 实现时 Inspect 实时 Slot 合同 |
| G12' | 迁移/回滚演练纯态跑通 | 真机（容器资源检查 R5 + active-child M5 实况） |
| G13' | 载荷门已上线（digest/denylist/入口点） | 剩余：干净消费者安装验证 + schema freshness fail-on-diff 于 CI 强制 |
| G14 | canary/GA 门 | hard gates 100%（机器子集已自动化）、模型族 ≥90%、false-success <1%、soak |

## 下一步行动（owner 决策优先）

1. 等 17 场景评测跑完（预计 ~5 小时）→ 重建 summary → 生成 MODEL-EVAL-REPORT；
2. 对 R16 跟踪 DSH 上游（或接受 Boulder 镜像方案并签字）；
3. 评测期间不重建镜像（运行中容器使用镜像快照）；评测后按 G5'/G6'/G7' 逐项
   做容器级绑定验证并回填 E22 Live Evidence；
4. G12' 真机演练、G13' 干净消费者验证；
5. 全部通过后进入 canary/GA 门评估。

## 完整性声明

- 本仓库只声明"合同级实现 + 容器级集成证据（含真实模型 live 证据）"，不宣称 GA；
- `parity.json` 的 `contract-implemented` 状态明确区别于 `implemented`（DSH 运行时绑定验证）；
- 所有未完成的 DAG 任务保持 `not-started`/`partial`，不会被平均值掩盖。
