# monitor → DSH 宿主绑定规格（G10，待实现）

纯逻辑：`src/monitor/policy.mjs`（状态采集/注入语义）。本文件定义 DSH 侧
绑定点；未宣称已实现。

## DSH 原生面事实（固定 SHA）

- `packages/runtime-diagnostics`（InvariantRegistry）：宿主内不变量注册与
  失败上报服务（`InvariantRegistry extends Service`，child installer fiber）；
- `packages/feedback`：`message-feedback`/`command-feedback`（用户反馈通道）；
- `packages/usage`（usage_report 工具面）与 session persistence 的计量数据；
- `packages/jobs`：Job 状态面。

## 映射

| OMO monitor 语义 | DSH 绑定 |
|---|---|
| monitor.enabled 门 + 状态注入 | 启用时注册 Invariant 检查 + `omo/monitor-status` prompt section（每步渲染快照） |
| 采集指标 | usage/Jobs/子代理活跃数/turn 计数（从 Session Log fold + services 读叶子字段） |
| 告警 | InvariantRegistry 失败上报 + `omo/monitor-alert` Session Log 事件（审计面） |
| 禁用 | 不注册 invariant、不注入 section（无残留） |

## 绑定点与生命周期

- 注册：`ctx.effect(() => registry.install(...))` 式注册 invariant；section
  经 `ctx.systemPrompt.section` 反注册；
- 采集纪律：只读叶子字段构造 owned 快照（不序列化 live 对象）；
- 频率：每步（turn 边界）刷新一次，快照大小上限固定。

## 验收清单（容器内）

- [ ] N-1：启用时下一回合可见 monitor 状态 section；
- [ ] N-2：触发一个 invariant 失败 → 上报可见且不中断会话；
- [ ] N-3：禁用后 section/注册无残留。
