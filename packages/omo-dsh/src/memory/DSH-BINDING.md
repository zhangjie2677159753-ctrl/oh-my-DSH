# memory → DSH 宿主绑定规格（G10，待实现）

纯逻辑：`src/memory/policy.mjs`（写允许/脱敏/scope 读/tombstone）。本文件定义
DSH 侧绑定点；未宣称已实现。

## DSH 原生面事实（固定 SHA）

- DSH 无独立 memory 包：跨会话记忆的本机面是 Session persistence
  （`packages/session/session-persistence`）+ storage 包 + Session Log 事件；
- Session Log 只追加、immutable snapshot 读取；未知非 ignorable 事件被
  restore 拒绝（R16，见 SOURCE-BASELINE §5.6）；
- prompt 注入面：`ctx.systemPrompt.section({name, order, text})`；
- 文件面：项目内 `.omo/` 目录（Boulder 仓储同源，`src/boulder/repository.mjs`
  已实现原子写）。

## 映射

| OMO memory-core 语义 | DSH 绑定 |
|---|---|
| 写（consent/scope 门） | `assertMemoryWriteAllowed` → `omo/memory-write` Session Log 事件 + `.omo/memory/<scope>.json` 文件镜像（Boulder 仓储同一 fs 实现） |
| 读（scope 过滤） | `readScope` → 启动时从镜像恢复 + fold `omo/memory-*` 事件 |
| 脱敏 | `applyRedaction` 在写路径强制（事件与文件双面一致） |
| tombstone | `omo/memory-tombstone` 事件 + 镜像删除；恢复时优先折叠 tombstone |
| fork-cost 路由（上游 memory-fork-cost-routing） | 不在 Batch A：记录 deviation，不伪造 |

## 绑定点与生命周期

- 注册：DSH 插件 `tools/pre-execute` 不介入 memory（memory 非工具面）；
  绑定发生在 session 事件 fold + 文件镜像两个钩子，均 `ctx.effect` 反注册；
- 恢复：先读镜像 → 折叠 Session Log 中 `omo/memory-*`（seq 去重）；
  镜像与日志冲突时日志胜（append-only 权威），偏差计数上报；
- R16 兜底：`omo/memory-*` 事件同样受 restore 拒绝约束 → 镜像为权威，
  事件为审计（与 Boulder 镜像 reconciliation 同一模式）。

## 验收清单（容器内）

- [ ] M-1：带 consent 的写产生事件 + 镜像文件，两处内容一致且已脱敏；
- [ ] M-2：scope 外读不可见；tombstone 后恢复不可见；
- [ ] M-3：日志/镜像冲突时日志胜且偏差计数正确；
- [ ] M-4：重放恢复（含 R16 拒绝路径回退镜像）。
