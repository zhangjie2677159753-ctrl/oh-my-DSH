# Continuation 的 DSH 绑定 Spec（E17）

`decideContinuation` 纯决策器已在仓库内 100% 测试；DSH 侧绑定在
session 级验证环境就绪（凭据或 API 通道）后按下述精确形态接入，
接入前不注册到 preset（避免在无验证的情况下自动续跑）。

## 事件面（固定 SHA 已核验）

- `ctx.on('agent/session-start', ({ agent }) => …)`：会话启动时复位 attempt 状态；
- `ctx.on('session/event', (session, event) => …)`：scope 过滤后用
  `ctx.agents.get(session.id)` 找到 owner agent；
- `agent/turn-stopping` + `agent.steer(...)`：同 Turn 追加续跑 step；
- 决策输入全部来自 durable 状态（Todo fold、goal、child 状态、failure/stagnation 计数）；
- 所有 listener 必须 `ctx.on` 注册（fiber 生命周期），stop/update 后零残留。

## 接入骨架（仅作 spec，未注册）

```js
// 伪码：验证环境就绪后加入 omo-role-plugin 的 apply()
ctx.on('agent/turn-stopping', ({ agent }) => {
  const decision = decideContinuation({ ...durableInputs(agent) })
  if (decision.action === 'continue') {
    agent.steer({ /* continue directive */ })
  }
  // wait/pause/stop/blocked/verifying 均不追加 step
})
```

## 前置条件（缺一不接入）

1. session 级容器验证通过（G1-DEPLOYMENT-CHECKLIST.md）；
2. R16 的持久化回退方案（Boulder 镜像 reconciliation）已落地；
3. 真实模型至少跑通一次 `omo_role` 切换 + guard deny 的端到端回合；
4. 回归：stop 在 countdown 前后都生效、child 运行中不注入、compaction 窗口不注入。
