# children → DSH 宿主绑定规格（P2 settlement 绑定，待实现）

纯逻辑：`src/children/{registry,dsh-binding}.mjs`（launch 请求/continuable 判定）、
`src/children/notification.mjs`（通知事件/pending 注入）、
`src/tasks/{control,orchestration}.mjs`（interrupt/send/结算记录）。
本文件定义 DSH 侧 settlement 绑定点；未宣称已实现。

## DSH 原生面事实（固定 SHA）

- 子代理事件：`subagent/start`、`subagent/end`、`subagent/descriptor`
  （`packages/subagent/subagent`）；
- `send_message` 排 later turn、不改向活跃回合；`interrupt_agent` 只取消当前
  回合、保留 inbox 与后代（已锁入 `TASK_CONTROL_CONTRACT`）；
- 父会话通知注入：`Session.append(type:"omo/notification", data)` + 下一回合
  prompt section 渲染（R16 约束同 SOURCE-BASELINE §5.6，镜像兜底）。

## 绑定点与生命周期

- 订阅：`ctx.on('subagent/end', handler)`，handler 把结算归一化为 owned
  notification（`settlementToNotification`）→ `mergePendingNotifications`
  入 pending 集 → `Session.append`；
- 注入：下一回合由 prompt 绑定渲染 `consumePendingNotifications` 结果并清空
  （幂等、防重放；`MAX_PENDING=8` 上限）；
- 反注册：全部经 `ctx.on` 返回的 disposer；child 停止/会话结束不得泄漏订阅。

## 验收清单（容器内）

- [ ] C-1：子代理结算后父会话出现 `omo/notification` 事件且下一回合注入、注入后清空；
- [ ] C-2：失败/中断结算同样产生通知（不丢失）；
- [ ] C-3：同 childSessionId 重复结算只保留最新（latest-wins）；
- [ ] C-4：pending 超上限时最旧丢弃且计数可见。
