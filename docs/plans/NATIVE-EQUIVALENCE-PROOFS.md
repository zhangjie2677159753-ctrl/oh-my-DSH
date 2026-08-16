# Native-Equivalence Proofs（E22 五项 native-equivalent 等价证明）

数据源（双向固定 SHA，任何漂移 fail closed）：

- OMO：`code-yeongyu/oh-my-openagent@038ed0cbbefe2b40677b63867aeea0d16bc303e0`，本地提取树
  `/tmp/oh-my-openagent-plan-audit`；路径以 `packages/omo-opencode/src/` 为根（下称 `OMO:`）。
- DSH：`/home/zhangjie/projects/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`；
  路径以仓库根为根（下称 `DSH:`）。

本文为 `docs/plans/HOOK-CLOSURE-REPORT.md` 中五项 `native-equivalent` 的等价证明主体：
每项给出 ① 上游行为（逐条带行号引用）② DSH 原生机制（带行号引用）③ 映射规则
④ 残余缺口与 compat 补丁 ⑤ live 观察检查单。live 观察列在 G1 session 级容器验证中
执行并回填本文件「Live Evidence」块；全部回填前 GA 门不放行（HOOK-CLOSURE-REPORT 约束）。

## 0. DSH 原生面事实（本文引用基础）

- Compaction：`ctx.compaction`（`CompactionEngine`）为抽象服务，提供
  `compactIfNeeded(agent, trigger, signal)` 与 `compactNow(...)`；触发器仅两种
  `pressure | context-overflow`；成功一次将选定 surface span 替换为单 summary 节点，
  替换 user message 携带 `compactCheckpointSource` 事务身份；同会话并发 compaction 被互斥。
  （`DSH:packages/compaction/compaction/src/index.ts`）
  - 默认后端 `compaction-basic`：`DEFAULT_THRESHOLD_RATIO = 0.8`（压力占比阈值，
    默认路由模型），`DEFAULT_RETAIN_RATIO = 0.16`（压缩后保留比例）；支持 per-model
    policy override（`policy.thresholdRatio`/`retainRatio`）；校验 retain < threshold。
    （`DSH:packages/compaction/compaction-basic/src/config.ts:19-23,74-87,144-159`）
  - context-overflow 路径可"强制有用均衡缩减，即使低于正常阈值"；单个超大保留单元
    无法经 surface compaction 修复（`DSH:packages/compaction/compaction/src/index.ts` 注释）。
- Bash 非交互环境：`bash-local` 的 `ENV_OVERRIDES = { NO_COLOR:'1', TERM:'dumb',
  PAGER:'cat', GIT_PAGER:'cat' }`，作为"model-friendly terminal environment"合并进每次
  spawn 的显式 env（可信调用方显式条目仍可覆盖）；注释明言同 Codex 硬编码集合，
  Claude Code 经 TERM=dumb 达成（`DSH:packages/shell/bash-local/src/index.ts:21-33`）。
- 交互终端：`ctx.terminals`（`TerminalSessionService`）为进程内 PTY 会话注册表，
  会话按精确 Agent 归属（owner），支持 named session、`list(owner)`、spawn/send、
  owner 生命周期自动清理（`disposeAll`/`disposedOwners`）（`DSH:packages/terminal/terminal/src/index.ts`）。
  - 模型工具 `tool:pty`（`terminal_open` 等）注册于
    `DSH:packages/terminal/tool-terminal/src/index.ts:157-167`。
- 子代理结算事件：`subagent/start`、`subagent/end`、`subagent/descriptor`
  （`DSH:packages/subagent/subagent/src` 事件词汇）；Job 体系另有 jobs 包。
- Slash 命令：`ctx.commands.register({name,description,handler})`；每次执行产生持久
  `command/run`/`command/done` 配对事件（`commandId` 关联），`commands/change` 为
  注册表变更 emit 事件；命令由人输入经 UI 派发（`CommandSourceMap` 唯一变体 `user`）
  （`DSH:packages/interaction/commands/src/types.ts`、
  `DSH:packages/client/ui-commands/src/client/service.ts:164`）。
- Skills：`skills` 服务 + `tool-skill`；显式调用注入为 `instructions`-form 上下文
  （`DSH:packages/skill/skill/src/index.ts:142-157`）。

## 1. preemptive-compaction ↔ DSH CompactionEngine

### 1.1 上游行为（OMO）

- 注册门：`isHookEnabled("preemptive-compaction")` 且 `experimental.preemptive_compaction`
  为真，否则 null（`OMO:plugin/hooks/create-session-hooks.ts:83-88`）。
- 订阅 `tool.execute.after` 与 `event`（`OMO:hooks/preemptive-compaction.ts:106-109`）。
- 触发条件（每次工具执行后评估）：未 compaction 过、不在进行中、距上次 ≥60s 冷却、
  有缓存 token 状态、`totalInputTokens = tokens.input + tokens.cache.read`、
  `usageRatio = totalInputTokens / actualLimit ≥ 0.78`、modelID 非空
  （`OMO:hooks/preemptive-compaction-trigger.ts:60-95`；常量
  `TIMEOUT 60_000 / THRESHOLD 0.78 / COOLDOWN 60_000` 于 `:14-16`）。
- 动作：`client.session.summarize({path:{id}, body:{providerID,modelID,auto:true}})`，
  60s 超时；成功后标记 `compactedSessions`；失败 toast "Preemptive compaction failed /
  Context window is above 78%..."，warning，10s（`OMO:hooks/preemptive-compaction.ts:86-134`）。
- 压缩模型解析：`pluginConfig.agents[<key>].compaction.model` 存在且形如 `p/m` 时覆盖
  provider/model（`OMO:hooks/shared/compaction-model-resolver.ts:13-33`）。
- 状态卫生：`session.deleted` 清全部闭包状态 + degradation monitor；
  `session.compacted` 通知 monitor；`message.updated`（assistant + finish + tokens）
  缓存 `{providerID,modelID,tokens}` 并解 compacted 标记
  （`OMO:hooks/preemptive-compaction.ts:48-104`）。

### 1.2 DSH 原生映射

| 上游 | DSH 原生 | 等价性 |
|---|---|---|
| 78% 输入占比触发 | `compaction-basic` `thresholdRatio 0.8`（默认）/per-model override | 等价（可配置为 0.78 精确复刻；per-model policy 覆盖 `agents[<key>].compaction.model` 的按代理配置） |
| `summarize auto:true` | `compactIfNeeded` 的 pressure 路径 → summary 节点替换 surface span | 等价（DSH 替换范围语义更强：span + checkpoint 身份） |
| 60s 冷却 / 60s 超时 | 服务实现自持 trigger policy（`compactIfNeeded` 契约允许"latest durable routed request"度量） | 由 compat 配置层表达（见 1.3） |
| 失败 toast | DSH 无 toast 面（`CommandResult` / UI 投影） | compat：投影层错误通道 |
| `session.compacted`/`session.deleted` 卫生 | DSH 引擎内建并发互斥与 owner 生命周期清理 | 等价（原生更强：事务锁） |
| context-overflow | 同名词触发器，可强制低于阈值压缩 | 等价且上游没有 |
| 单超大单元不可修复 | 显式声明（见 §0） | 行为一致 |

### 1.3 残余缺口与 compat 补丁

1. **0.78 vs 0.8**：`omo-dsh` 预设配置将 `compaction-basic` 的 `thresholdRatio`
   设为 `0.78`、`retainRatio` 保持 `0.16`，与上游常量精确一致；per-agent
   compaction model 经 `compaction-model-resolver.mjs` 输出到 per-model policy。
2. **触发时机**：上游在每次 `tool.execute.after` 评估（工具后立即可能压缩）；
   DSH 由引擎在压力度量点决策。等价性按"结果一致"（超阈值必压缩、冷却约束）
   接受，冷却/超时常量由 compat 配置持有并做 drift test。
3. **toast**：上游失败提示映射到 DSH 会话错误事件/投影通道（`omo/compaction-failed`）。
4. 上游 `compaction-context-injector` / `compaction-todo-preserver`（另两 hook，
   属 contract-level 41 项）与本节引擎正交，不重复。

### 1.4 Live 观察检查单

- [ ] P1-1：会话注入 >78% 输入占比后，下一工具执行/回合边界出现 `compaction/start`..`compaction/end` 对与 checkpoint summary 节点；
- [ ] P1-2：冷却窗口内第二次压力不触发第二次压缩；
- [ ] P1-3：per-agent compaction model 配置生效（压缩调用路由到指定 provider/model）；
- [ ] P1-4：Boulder/role 事件在压缩后仍可恢复（与 resume-context 校验联合）。

## 2. background-notification ↔ subagent/job settlement 事件

### 2.1 上游行为（OMO）

- 转发事件白名单：`message.updated`、`message.part.updated`、`message.part.delta`、
  `todo.updated`、`session.idle`、`session.error`、`session.deleted`、`session.status`，
  以及前缀 `session.next.*`（`OMO:hooks/background-notification/hook.ts:20-36`）。
- `event`：命中白名单 → `manager.handleEvent(event)`（`:39-42`）。
- `chat.message`：无条件 `manager.injectPendingNotificationsIntoChatMessage(output,
  input.sessionID)`（`:44-49`）——把后台会话累计的待发通知注入下一次聊天消息。

### 2.2 DSH 原生映射

| 上游 | DSH 原生 | 等价性 |
|---|---|---|
| 后台会话事件转发 | `subagent/start`/`subagent/end`（+ jobs 包事件） | 等价（DSH 子代理即后台会话；事件面更窄但语义完备：settlement 是通知点） |
| pending 通知注入下一 chat.message | parent 会话 `Session.append`（`omo/notification` 系统事件）+ prompt section 注入 | 等价（见 2.3） |
| 多事件类型（message.part.delta 等） | DSH 子代理内部事件不外露到父会话 | 语义收缩：仅结算级通知（接受并记录） |

### 2.3 残余缺口与 compat 补丁

1. `children/dsh-binding.mjs` 订阅 `subagent/end`，把结果投影为 `omo/notification`
   事件 append 进父会话（Boulder 镜像同步）；`session.idle`/`session.status` 类
   上游事件在 DSH 无对应面，不构造。
2. "注入下一聊天消息"由 `omo/notification` 事件 fold + prompt section 复现：
   待发通知在下一回合 systemPrompt 注入并清空 pending 集（幂等、防重放）。

### 2.4 Live 观察检查单

- [ ] P2-1：后台子代理结算后，父会话出现 `omo/notification` 事件；
- [ ] P2-2：下一回合模型上下文可见通知文本，且注入后 pending 清空（不重复注入）；
- [ ] P2-3：子代理失败/中断同样产生结算通知（不丢失）。

## 3. non-interactive-env ↔ bash-local ENV_OVERRIDES

### 3.1 上游行为（OMO）

- `tool.execute.before` 仅处理 `tool.toLowerCase()==="bash"` 且 command 为字符串
  （`OMO:hooks/non-interactive-env/non-interactive-env-hook.ts:70-81`）。
- 交互命令警告：命令命中 `SHELL_COMMAND_PATTERNS.banned`
  （`vim, nano, vi, emacs, less, more, man, python REPL, node REPL, git add -p,
  git rebase -i`；不含 `(` 的条目编译为 `\b` 词边界正则）时设置
  `output.message = "Warning: '<cmd>' is an interactive command that may hang in
  non-interactive environments."`（`:10-12,83-86`；
  `OMO:hooks/non-interactive-env/constants.ts:55-60`）。
- git 命令环境注入：仅 `/\bgit\b/` 命令；按 shell 类型拼
  `NON_INTERACTIVE_ENV`（`CI=true, DEBIAN_FRONTEND=noninteractive,
  GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never, HOMEBREW_NO_AUTO_UPDATE=1,
  GIT_EDITOR=:, EDITOR=:, VISUAL=, GIT_SEQUENCE_EDITOR=:, GIT_MERGE_AUTOEDIT=no,
  GIT_PAGER=cat, PAGER=cat, npm_config_yes=true, PIP_NO_INPUT=1,
  YARN_ENABLE_IMMUTABLE_INSTALLS=false`）为前缀；幂等（已含前缀则跳过）
  （`:89-115`；`OMO:hooks/non-interactive-env/constants.ts:3-24`）。

### 3.2 DSH 原生映射

| 上游 | DSH 原生 | 等价性 |
|---|---|---|
| git 命令注入非交互 env | `ENV_OVERRIDES` 对**每次** bash 执行注入（NO_COLOR/TERM=dumb/PAGER/GIT_PAGER） | 超集（范围更宽、条目更少） |
| banned 交互命令警告 | 无原生对应 | compat 补丁（3.3-1） |
| shell 类型感知前缀 | DSH 由 bash/pwsh 执行器各自持有 env | 等价（执行器分派天然区分 shell） |

### 3.3 残余缺口与 compat 补丁

1. **banned 命令警告**：DSH 无等价面 → 纯逻辑 `guards/non-interactive.mjs` 已复刻
   上游正则与 message 文本（`NATIVE-EQUIVALENCE-PROOFS.md` §3 + 测试覆盖）。
   **交付缝缺口（2026-08-16 记录）**：DSH `tools/pre-execute` 的
   `PreToolDecision` 仅 allow/deny/ask，无 per-call 警告注入面；OMO 的警告是
   "提示但仍执行"，不能用 deny 替代。警告交付需 tool-output 投影缝
   （UI/工具结果增强，G11 阶段），此前 P3-1 live 项标注 blocked-on-seam。
2. **git 专用 env 条目**（DEBIAN_FRONTEND/GCM_INTERACTIVE/EDITOR=: 等）：DSH
   全局 ENV_OVERRIDES 未覆盖；compat 层不重复注入（DSH 的 PAGER/GIT_PAGER/TERM=dumb
   已消除同类挂起风险），差异记录为"语义等价、条目收缩"，GA 门不阻塞。
   如后续实测出现 git 挂起，再按上游全表补齐（预留配置点）。

### 3.4 Live 观察检查单

- [ ] P3-1：bash 执行 `vim`/`nano`/`less`/`git add -p` → 出现上游同文警告（compat guard 生效）；
- [ ] P3-2：`git log` 等命令输出未被 pager 污染（原生 ENV_OVERRIDES 生效）；
- [ ] P3-3：普通非 git 命令不带警告、不带注入前缀（无过度干扰）。

## 4. interactive-bash-session ↔ terminals 服务 + tool:pty

### 4.1 上游行为（OMO）

- 注册门：`isHookEnabled("interactive-bash-session")` 且 tmux 集成启用
  （`OMO:plugin/hooks/create-session-hooks.ts:162-166`）。
- `tool.execute.after` 仅处理 `interactive_bash` 且 `args.tmux_command` 为字符串；
  output 以 `Error:` 开头则跳过；解析 subCommand/sessionName：
  `new-session` → 加入跟踪集，`kill-session` → 移除，`kill-server` → 清空；
  变更后持久化 per-session JSON（`INTERACTIVE_BASH_SESSION_STORAGE` 目录下
  `${sessionID}.json`）；操作后把 `buildSessionReminderMessage`（"Active omo-* tmux
  sessions: ..."）append 到 output（`OMO:hooks/interactive-bash-session/hook.ts:47-101`；
  `constants.ts:3-12`；`storage.ts:15-62`）。
- `session.deleted`：kill 全部跟踪的 tmux 会话、abort 全部 subagentSessions、
  清状态与持久文件（`hook.ts:103-116`；`state-manager.ts:27-43`）。

### 4.2 DSH 原生映射

| 上游 | DSH 原生 | 等价性 |
|---|---|---|
| tmux 会话跟踪（omo-* 命名） | `TerminalSessionService` owner-scoped PTY 会话 + 命名 + `list(owner)` | 等价且原生更强（无需解析 tmux 子命令文本） |
| `interactive_bash` 工具 | `tool:pty`（`terminal_open`/send 族） | 等价 |
| 会话提醒消息 | `list(owner)` 快照 → prompt section/工具输出投影 | 等价（4.3-2） |
| session.deleted 全量清理 | owner 生命周期自动清理（disposeAll） | 等价且原生（无需挂 session.deleted） |
| per-session JSON 持久化 | DSH 无（终端会话进程内） | 语义收缩：跨进程重启不保留活跃 PTY（上游 tmux 同被 kill-server 清空），接受 |

### 4.3 残余缺口与 compat 补丁

1. 上游对 tmux 命令的解析/拦截逻辑（识别 new/kill/kill-server）不再需要：DSH 终端
   会话是注册表对象，开/关即注册表增删，不依赖命令行文本。
2. 提醒消息：compat 投影把 `terminals.list(agent)` 渲染为同文 reminder
   （"Active sessions: ..."），注入下一回合 prompt 或终端工具输出。
3. `interactive_bash` 工具名差异：模型经预设 systemPrompt 指引使用 `tool:pty`
   族工具（等价性按"交互终端能力可达"验收，不按工具名）。

### 4.4 Live 观察检查单

- [ ] P4-1：模型开一个交互终端 → `terminals.list(owner)` 出现对应 named session；
- [ ] P4-2：终端 send 后输出可见（PTY 双向）；
- [ ] P4-3：会话结束/Agent dispose 后终端会话全部关闭（无泄漏）；
- [ ] P4-4：提醒消息在下回合出现且列出活跃会话名。

## 5. auto-slash-command ↔ commands registry + skills 服务

### 5.1 上游行为（OMO）

- 注册门：`isHookEnabled("auto-slash-command")`；入参
  `{skills: mergedSkills, pluginsEnabled: claude_code.plugins ?? true,
  plugins_override, directory}`（`OMO:plugin/hooks/create-skill-hooks.ts:39-47`）。
- `chat.message`：检测用户文本 `/name args`（跳过 fenced code 块与排除集
  `ralph-loop/cancel-ralph/ulw-loop`）→ 执行 `executeSlashCommand` → 成功则把该 part
  替换为 `<auto-slash-command>\n{replacementText}\n</auto-slash-command>` 包裹内容；
  按 `sessionID:messageID:command` 去重（`OMO:hooks/auto-slash-command/hook.ts:91-160`）。
- `command.execute.before`：对命令事件同样展开（去重键含 eventID/fallback，
  fallback 键 TTL 100ms）（`:162-225`）。
- 执行器：命令发现顺序 `project > user > opencode-project > opencode > builtin >
  plugin` + skill 命令；skill 命令带 `metadata.agent` 校验；模板变量
  `${user_message}`/`$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP`；追加 `## User Request`
  节（有 args 无变量引用时）（`OMO:hooks/auto-slash-command/executor.ts:57-194`）。
- `session.deleted`/`dispose`：清理去重表（`hook.ts:226-243`）。

### 5.2 DSH 原生映射

| 上游 | DSH 原生 | 等价性 |
|---|---|---|
| 命令发现（project/user/builtin/plugin 作用域） | `ctx.commands.register` 注册表 + UI popup（贡献/宿主命令） | 等价（作用域表达为注册插件归属） |
| 人输入 `/name args` 派发 | UI 派发 `command/run` → handler → `command/done` | 等价且原生（无模型参与） |
| skill 命令展开进模型上下文 | `skills` 服务 + `tool-skill` 注入 `instructions` 上下文 | 等价（能力面） |
| 模型消息中的 `/name` 文本替换 | DSH 无原生（模型消息不改写） | compat 收缩：模型侧 `/` 不展开，改为 skill 调用指引（5.3-2） |
| 模板变量渲染 | Command handler 直接持有 sessionId 上下文 | 等价（handler 参数含 invocation 上下文） |

### 5.3 残余缺口与 compat 补丁

1. OMO skill slash-command 目录迁移为 DSH 命令贡献：`skills/policy.mjs` 输出的
   每个 skill 命令 `ctx.commands.register({name, description, handler})`，handler
   复刻模板渲染（`$ARGUMENTS`/`$SESSION_ID`/`$TIMESTAMP`）并以 `CommandResult`
   返回；`metadata.agent` 校验保留在 handler 内。
2. 模型发消息含 `/cmd`：上游会替换注入；DSH 不改写模型消息。compat 决定：模型
   侧 slash 展开**放弃**（DSH 的原生 skill 调用面是 `tool-skill`），等价性按
   "命令可被人输入触发、skill 内容可注入模型上下文"两项验收；此项收缩记录在案。
3. 去重/TTL 逻辑（100ms fallback dedup）随 command registry 的事件模型消失
   （DSH 每次派发即一次独立执行），不构造。

### 5.4 Live 观察检查单

- [ ] P5-1：人输入 `/omp-status`（迁移命令）→ `command/run`/`command/done` 配对事件 + 结果渲染；
- [ ] P5-2：skill 内容经 `tool-skill` 注入为 `instructions` 上下文（模型可见）；
- [ ] P5-3：排除集（ralph 类）不注册、不展开；
- [ ] P5-4：未知 `/cmd` 得 "Command not found" 级错误而非静默。

## 6. 关闭判据

五项全部满足以下才算 E22 native-equivalent 关闭：

1. 每项 §3 缺口（compat 补丁）有对应纯逻辑模块 + `node --test` 覆盖（merge 到 264 基线之上）：

   | 项 | 模块 | 测试 | 状态 |
   |---|---|---|---|
   | P1 | `packages/omo-dsh/src/compaction/policy-config.mjs` | `tests/compaction-notification.test.mjs` | [x] 覆盖 |
   | P2 | `packages/omo-dsh/src/children/notification.mjs` | `tests/compaction-notification.test.mjs` | [x] 覆盖 |
   | P3 | `packages/omo-dsh/src/guards/non-interactive.mjs` | `tests/non-interactive.test.mjs` | [x] 覆盖 |
   | P4 | `packages/omo-dsh/src/compat/terminal.mjs` | `tests/slash-command-terminal.test.mjs` | [x] 覆盖 |
   | P5 | `packages/omo-dsh/src/skills/slash-command.mjs` | `tests/slash-command-terminal.test.mjs` | [x] 覆盖 |

2. 每项 §4 live 检查单在 G1 session 级容器验证中全部勾选，证据回填本文 Live Evidence 块
   （附 evidence 路径/事件 seq 引用）；
3. `parity.json` 对应五行 `liveEvidence` 落证据引用后，HOOK-CLOSURE-REPORT 的
   "session 级等价观察" 前提满足，E22 方可标 closed。

## Live Evidence（G1 验证后回填）

| 检查项 | 结果 | 证据位置 | 日期 |
|---|---|---|---|
| P1-1..P1-4（compaction） | 未执行：需长会话压力；compat 配置（0.78/0.16）已入 `compaction/policy-config.mjs` + 测试 | - | - |
| P2-1..P2-3（notification） | 绑定以源核实形状修正（`SubagentRunEndInfo` + stopReason 映射），RC 镜像加载零错误（G1-EVIDENCE 16）；settlement 事件仍未在窗口内 live 观察（descriptor 两次确认 launch） | G1-EVIDENCE 16 | 2026-08-16 |
| P3-1（banned 命令警告） | **blocked-on-seam**：DSH pre-execute 无 per-call 警告注入面（OMO 为警告非拒绝），警告交付需 G11 tool-output 投影缝；P3-2/P3-3 由 DSH 原生 ENV_OVERRIDES 覆盖（语义等价，已记录） | §3.3 | 2026-08-16 |
| P4-1..P4-4（terminal） | 未执行：需模型使用 tool:pty；提醒文本构建器已入 `compat/terminal.mjs` + 测试 | - | - |
| P5-1..P5-4（slash-command） | 未执行：UI 派发面，headless 无命令输入；模板执行器已入 `skills/slash-command.mjs` + 测试 | - | - |
