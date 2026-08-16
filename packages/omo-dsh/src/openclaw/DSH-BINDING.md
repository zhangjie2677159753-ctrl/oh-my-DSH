# openclaw → DSH 宿主绑定规格（G10，待实现）

纯逻辑：`src/openclaw/policy.mjs`。本文件定义 DSH 侧绑定点；未宣称已实现。

## DSH 原生面事实（固定 SHA）

- DSH 无 OpenClaw 集成：无原生等价面。可用组合面：
  - `packages/api/gateway` + `remotes`（外部 API 网关/远端会话查找）；
  - `packages/tools` 自定义工具注册（`ctx.tools.register`）；
  - `packages/schedule`（定时触发）。

## 映射（诚实声明：全为适配层，无原生等价）

| OMO openclaw 语义 | DSH 绑定 |
|---|---|
| openclaw.enabled 门 | preset 配置读取（纯逻辑已有） |
| 控制面（发送/接收） | 自定义工具 `openclaw_send` 等 + api gateway 远端会话 |
| 定时/事件驱动 | `packages/schedule` 触发 → 任务入队 |
| 凭据 | credential 引用（`omo-openclaw` 凭证名），绝不明文入配置/日志 |

## 绑定点与生命周期

- 注册：启用时注册工具 + 定时器（`ctx.effect` 反注册）；禁用时零注册；
- 出站消息必须过 `assertMemoryWriteAllowed` 同型的 consent 门与脱敏；
- 所有网络出站经 gateway（不走裸 fetch，除非 Builtin 探明允许）。

## 验收清单（容器内）

- [ ] O-1：启用时工具目录出现 openclaw 工具、禁用时不存在；
- [ ] O-2：出站消息含 secret 形内容被脱敏/拒绝；
- [ ] O-3：禁用后定时器/工具无残留。
