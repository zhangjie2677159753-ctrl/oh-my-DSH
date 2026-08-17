# Canary / 内部试用计划（G14 / E31 后续）

日期：2026-08-17
分发约束：L0（内部团队、私有分发，`docs/legal/USAGE-DECISION.md`）。
目标：在真实使用中验证行为质量，为 GA 提名收集数据——canary 是**团队活动**，
本计划书是执行手册；agent 侧的全部前置工程已关闭。

## 1. 入口条件（当前状态，全部达成）

- [x] 合同级核心 62 模块 / 352 测试全绿；preflight 13 项；
- [x] 双模型族 17 场景评测（opencode-go 全完成 273 调用/3 角色切换/6 硬门 PASS）；
- [x] live 证据套件 25 项（角色/守卫/交接/结算/终端/镜像/续跑/隔离/soak 20-20）；
- [x] R16 ADR 签字、G4 回放执行、E29-E31 演练、主镜像全验证面；
- [x] 快速模型路由（opencode-go）与演示台（LAN/Tailscale 3200）可用。

## 2. 三阶段推进

| 阶段 | 人群 | 时长 | 指标门槛 |
|---|---|---|---|
| C1 试点 | 1-2 名 owner 指定成员，只读仓库 + 演示台对话 | 1 周 | 无 P0 缺陷；角色误切换 0；人工行为分 ≥ 80 |
| C2 小组 | 核心小组（≤5 人），容器 web 会话 + 真实小任务 | 2 周 | 人工行为分 ≥ 90（10 维度权重表）；守卫拒执 100% 正确；false-success 0 |
| C3 内部 | 全团队，真实项目任务 | 2-4 周 | 维持 C2 门槛 + soak 稳定 ✅（连续 50+ 会话零失败，2026-08-17 已达成 agent 侧可测部分） |

## 3. 监控与 kill-switch

- 监控：`omo_monitor_status` 工具 + InvariantRegistry（宿主接入后）+ usage 报告；
  每次角色切换/守卫拒执/续跑决策落 Session Log 审计；
  **C1 演示台仪器已上线**（2026-08-17）：每对话会话记录机器事实
  （工具调用/角色事件/回合，/tmp/omo-demo-sessions.jsonl），`GET /stats`
  输出累计指标与 false-success 候选（声称完成但零工具调用）；
- kill-switch：R-rollback 演练（`drill-rollback.sh`）+ preset 停止 + 载荷 digest
  回退；任一阶段指标不达标即回退至上一阶段；
- 数据纪律：行为分由人审（10 维度权重表 `eval-corpus.json` behavioralScore），
  不宣称自动化评分。

## 4. GA 提名条件（canary 完成后）

1. C3 全部指标达标且持续 2 周；
2. 硬门全部关闭（含人审项）；false-success < 1%（采样审计）；
3. R16 上游状态复核（ADR 复审条款）；
4. 提交 GA 提名报告（本仓库新文件），由 owner 决策——本计划不自动晋升 GA。

## C2 通道验证（2026-08-17）

- 容器 web profile 携带 omo preset 启动验证通过（boot 200、settings
  default: omo、discovery healthy——历轮 G1 证据）；会话创建走浏览器 UI
  （Typert RPC，用户驱动），属 C2 成员操作步骤；
- C2 成员用法：`prepare-home-opencode.sh` 生成 home → 容器 web 启动 →
  浏览器访问 3091 新建会话（preset 自动挂载）→ 真实小任务；
- agent 已备：web 启动脚本、主镜像全绑定、行为评分工作单、/stats 仪器。
- 演示台持久化：用户级 systemd 单元 `omo-demo.service`（on-failure 重启），
  LAN/Tailscale 3200 不再依赖会话内后台作业。

## C1 证据检查点（2026-08-17 13:15）

- 演示台累计会话 11+：四角色全覆盖（sisyphus/prometheus/hephaestus/atlas）、
  boulder 镜像读写环、memory 写读环、monitor/team/openclaw 门控、
  角色切换后镜像一致（hephaestus revision 1 → mirror 读回一致）；
- false-success 候选 0（采样器持续在线）；
- 双轮评测第二轮运行中（/tmp/omo-eval-ocg2，完成即出双轮一致性）。
