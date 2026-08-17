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
| C3 内部 | 全团队，真实项目任务 | 2-4 周 | 维持 C2 门槛 + soak 稳定（连续 50+ 会话零失败） |

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
