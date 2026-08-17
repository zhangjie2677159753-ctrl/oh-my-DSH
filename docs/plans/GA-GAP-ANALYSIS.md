# GA 差距分析（2026-08-17 终版，goal round 47 收口）

本文件回答一个诚实问题：**距离"按 Conformance Profiles 达到 GA 发布门"还差什么**。
当前状态：合同级核心（62 模块 / 350 测试）+ 受控容器集成证据（含**双模型族
真实会话 live 证据**）+ 核心工作流与 E22 等价面多数 live 闭环。GA 未达成，
差距按优先级列出。

## 已达成（证据见各文件）

1. 治理：License L0（内部/私有）、上游锁、基线 tag、默认分支 main；
2. 机器文件：parity.json（60 行，59 关闭）、task-dag.json（122 任务 + 校验器）、
   包分类、hook 清单 56/58/4、compat 合同 35 项（27 实现/8 未启动）、
   eval-corpus（17 E2E + 15 模型矩阵 + 9 hard gate + 10 评分）；
3. 纯逻辑层：62 模块、350 测试全绿；g1-preflight **13 项**全过（载荷 digest 门、
   schema 漂移、DAG 校验、E29/E31 演练、G4 证据层）；
4. DSH 集成（容器）：session 级 mount、`omo_role` 工具 + 守卫瀑布 + 身份段 +
   **动态角色段（RC live 零错误）** + **P2 结算通知父/子双落地 + 注入段**
   + **P4 终端族 isolate 组 live 闭环**；权限预设镜像宿主部署
   （danger-full-access，修复容器沙箱后端缺失）；
5. 权限真源纠偏：tool-config-handler 运行时层全覆盖；
6. **模型评测双模型族完成**：opencode-go/deepseek-v4-flash 17 场景 30 分钟
   全跑完（273 调用/211 回合/3 角色切换/6 硬门 PASS，
   `MODEL-EVAL-REPORT-OPENCODE-GO.md`）；NIM gpt-oss-120b 17 场景收尾
   （低吞吐如实，`MODEL-EVAL-REPORT-NIM.md`）；
7. **核心工作流 live**：E2E-04 prometheus 规划 → `/start-work` 交接 →
   hephaestus 实现（revision 1→2，parity PAR-ROLE-002）；E2E-03 56 调用
   全链（goal/todo/编辑）；E2E-16 hyperplan 正确角色。

## 差距清单（按阻塞优先级）

### P0 — 发布阻断

| # | 差距 | 需要什么 |
|---|---|---|
| G1'' | Session 级 mount/lifecycle 核心路径已达成 | 剩余矩阵项：双 Session 交互、flush 生命周期细节、child spawn/stop/resume 资源计数（headless 单会话内已大量覆盖） |
| G2 | ✅ R16 已按 ADR 接受：Boulder 镜像 reconciliation 兜底（owner 签字 2026-08-17，`ADR-R16-BOULDER-FALLBACK.md`）；上游注册面开放后迁移并复审 | 已接受-缓解；P1 跟踪上游 |
| G3 | ✅ 双模型族评测完成（opencode-go 全完成 + NIM 收尾） | 行为分人工判定（评分维度 10 项权重表已备） |
| G4 | 与上游的 differential 回放：证据层/比较引擎就绪，DSH 端就绪 | 需 OMO 侧可运行 OpenCode fixed-SHA 环境才能执行黑盒回放 |

### P1 — 行为闭包（纯逻辑已闭，live 大部达成）

| # | 差距 | 需要什么 |
|---|---|---|
| G5'' | E22 live：P2/P4 全闭环、G6 动态段 RC live、P3-1 blocked-on-seam（DSH 无 per-call 警告面） | 剩余：P1 compaction live（需超长会话，不可行则记录不适用）、P5 slash-command live（UI 派发面，headless 无命令输入）、P4-4 提醒注入 |
| G6'' | 动态角色段 live 达成（RC 零错误）；work 段内容（Boulder 投影）未接 | 镜像重建后 work 投影接入（Boulder 宿主绑定同 G8） |
| G7'' | task() 纯逻辑 + 子代理委派 live（E2E-08 完整完成、descriptor×3 观察、P2 结算闭环） | Job 后台/continuable 生命周期分支实测未做 |
| G8 | Boulder 文件仓储未接真实工作目录 | E14 宿主绑定 + 崩溃注入（规格已备） |
| G9 | Continuation 决策器未挂 turn-stopping | E17 DSH 事件绑定（规格已备） |

### P2 — 完整能力与发布工程

| # | 差距 | 需要什么 |
|---|---|---|
| G10' | Memory/Team/OpenClaw/Monitor 绑定规格已备 | Host 服务绑定实现 + 容器验收 |
| G11 | UI 投影未注册 Slot | 实现时 Inspect 实时 Slot 合同 |
| G12'' | 迁移/回滚纯态 + 干净消费者 drill 均通过 | 真机残余：容器资源检查 R5 实况、active-child M5 实况 |
| G13'' | 载荷门/干净消费者/schema freshness 全部上线 | CI 强制（本仓库无 CI 平台，preflight 手动门） |
| G14 | canary/GA 门 | hard gates **8/9 关闭**（6 机器全 PASS + 跨会话隔离/取消处置探针 PASS）；最终证据门如实记录为 prompt 级（代码强制属 G 项）；模型族行为分待人审；false-success 未自动化；soak 进行中 |

## 下一步行动（owner 决策优先）

1. ✅ R16 已签字接受（ADR）；继续 P1 跟踪上游注册面；
2. G4：提供/批准 OMO 侧 OpenCode 环境后执行黑盒回放；
3. G8/G9/G10：按规格继续宿主绑定实现（规格齐备，纯逻辑已就绪）；
4. 人审：E2E 行为分（10 维度权重表）+ 3 项 n/a hard gate 专用探针；
5. soak/canary 计划（canary 为内部团队试用，非公开分发）。

## 完整性声明

- 不宣称 GA、不宣称完整 OMO 对等；所有 `implemented` 语义保留给 live 验证，
  已由 G1-EVIDENCE 1-19 条支撑；
- 所有 P0 阻塞均指向具体外部条件（上游注册面/OMO 可运行环境/人审），
  非模糊拖延。
