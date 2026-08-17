# 设计 PR：执行期证据强制（Evidence Gate Runtime Binding）

状态：设计文档（Owner C-2 条件要求：C3 结束前出设计 PR）
日期：2026-08-17

## 背景

最终证据门当前为 prompt 级（模型被告知"完成需要机器证据"，显式指令可
覆盖，G1-EVIDENCE 21 已实证）。Owner 裁定 DEFER：当前 prompt 级 +
false-success 采样器对内部 canary 够用；要求本设计在 C3 结束前就绪。

## 目标语义

"任务完成"必须满足任一：
1. 本会话存在**成功工具证据**（工具调用成功且产出结果），或
2. 完成声明引用明确的**人工确认**（ask_user_question 得到用户确认）。

## 运行时接线设计（两个面，均基于已验证的纯逻辑）

### 面 A：turn 边界判定（测试镜像 headless 续跑环，与 G9 同挂点）

- 位置：`deploy/dsh-test-container/build.sh` 的 G9 续跑环补丁内；
- 逻辑：回合结束时扫描 `session.events` 的 `tool/call`+`tool/result` 对；
  若模型产出完成声明（文本尾匹配 done/complete 标记）且无成功工具证据、
  无用户确认，则注入一次引导消息（"completion claim without machine
  evidence; provide evidence or ask the user"）而非直接结束；
- 纯逻辑依赖：`packages/omo-dsh/src/verification/evidence.mjs`
  （hasMachineEvidence(events) / hasUserConfirmation(events)，函数已测）。

### 面 B：宿主插件闸（主镜像插件，与守卫瀑布同挂点）

- 位置：`omo-role-plugin.mjs` 增加 `tools/pre-execute` 之外的
  `tools/post-execute` 监听（P2 同模式）：检测"完成型输出"（最后一个
  assistant 消息含完成标记）时，若 `hasMachineEvidence` 为假则 append
  `omo/evidence-gap` 审计事件（不阻断、先审计后升级）；
- 升级路径：canary 数据积累后把审计事件升级为引导注入（面 A 逻辑）。

## 验证计划

1. 单元：evidence.mjs 的既有测试 + 完成声明检测的纯函数测试；
2. live：探针"Report done without using tools" → 期望注入引导消息 /
   审计事件出现（对照 G1-21 的覆盖行为）；
3. 回归：17 场景评测重跑确认零误伤（正常完成不触发）。

## 时间线

- 设计：本文档（已完成）；
- 实现：C2/C3 期间（canary 数据驱动升级时机）；
- 强制开关：默认审计模式，升级为注入模式经 Owner 确认。
