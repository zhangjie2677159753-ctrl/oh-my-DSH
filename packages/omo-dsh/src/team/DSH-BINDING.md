# team → DSH 宿主绑定规格（G10，待实现）

纯逻辑：`src/team/policy.mjs`（team mode 门/邮箱/状态注入语义）。本文件定义
DSH 侧绑定点；未宣称已实现。

## DSH 原生面事实（固定 SHA）

- DSH 无 team 包：最接近的本机面是 subagent 消息机制——`send_message`
  （later-turn 排队，不改向活跃回合）与 `interrupt_agent`（只取消当前回合、
  保留 inbox 与后代）（`packages/subagent/subagent`）；
- 事件面：`subagent/start`、`subagent/end`；无 mailbox 概念；
- prompt 注入面：`ctx.systemPrompt.section(...)`；
- 角色/会话状态：`omo/role` 等 Session Log 事件（R16 约束同 §5.6）。

## 映射

| OMO team 语义 | DSH 绑定 |
|---|---|
| team_mode.enabled 门 | preset 配置读取 → `teamPolicyEnabled()`（纯逻辑已有） |
| mailbox 注入 | `omo/team-mailbox` Session Log 事件 + prompt section 渲染（`renderNotificationInjection` 同型） |
| 状态注入器（bypass disabled_hooks 例外项） | 当 team_mode 启用时由 team 绑定注册注入器；禁用时不存在（忠实上游例外语义） |
| 成员间消息 | `send_message` 语义（later-turn）；不构造 mailbox 轮询 |

## 绑定点与生命周期

- 注册：team 绑定订阅 `subagent/end` 结算 → 投递 `omo/team-mailbox` 事件到
  目标会话（`Session.append`）；全部经 `ctx.effect`/`ctx.on` 反注册；
- 注入：下一回合 systemPrompt section 渲染未读 mailbox 并清空 pending
  （幂等、防重放，与 `children/notification.mjs` 同一模式）；
- 禁用：`team_mode.enabled=false` 时绑定不注册任何事件/注入（无残留）。

## 验收清单（容器内）

- [ ] T-1：team 启用时成员结算产生 mailbox 事件并在下回合注入、注入后清空；
- [ ] T-2：team 禁用时无 mailbox 事件/注入（disabled_hooks 例外语义忠实）；
- [ ] T-3：重放恢复 mailbox 不重复注入。
