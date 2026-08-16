# `task()` 的 DSH 绑定 Spec（E09/E11）

纯逻辑（normalize/descriptor/launch spec/spawn mapper）已 100% 测试；DSH 实调
按以下已核验 API 接入。所有字段名来自固定 SHA 的
`packages/subagent/subagent/src/types.ts`。

## 已核验的请求面

- one-shot：`SubagentStartRequest = { label?, prompt: ContentBlock[], parent: Agent,
  signal, agentOptions?, outputSchema?, maxDepth?, toolFilter?, persona? }`；
- 能力旗标 `SubagentCapabilities { outputSchema, depthLimit, toolFilter, persona }`：
  缺能力 → start 前 typed rejection（fail loud，不静默降级）；
- `toolFilter: ToolRestriction { allow?, deny? }`：in-process 后端把它作为 scoped
  `tools.restrict()`——**提示可见性与执行拒绝同源**（one visibility）；
- `persona` 在 child scope 注册 `deployment:persona` 段并 shadow 部署 persona；
- continuable：continuation manager 预留 durable child identity，
  `ContinuableCreateRequest { sessionId, parent, signal }`，
  提供方返回 `ContinuableCreateSpec { seed? }`（父日志已完成前缀）；
- Job：one-shot background 返回进程内 Job ID（重启即 lost，见 reconciler）。

## 接入顺序

1. `normalizeTaskArgs` → descriptor（foreground/job）；
2. `buildSpawnRequest`（本目录纯件）→ 请求 DTO；
3. 运行时层绑定真实 `parent` Agent、`signal`（工具 `exec.signal`）与 provider 能力旗标；
4. 结果映射：`stopReason` 非 `completed` → 失败；保留 partial 输出；
   foreground footer 用 `parseTaskResultFooter`；
5. continuable 结果返回 durable child Session identity，`task_send/task_cancel`
   走 manager 的 send/interrupt（queued-next-turn / keepInbox 语义已固化）。

## 前置（缺一不接入）

- session 级容器验证通过；
- provider 能力旗标实测（in-process 全项、ACP 全缺）；
- empty-result detector 与 retry 预算接 routing.mjs。
