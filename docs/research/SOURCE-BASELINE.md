# OMO for DSH 源码基线与事实核验

## 1. 目的

本文冻结开发规划所依赖的两套源码，并把“已核验事实”“目标设计”“有意增强”“待决事项”分开。实现者不得把目标设计反向描述成当前 OMO 或 DSH 已有事实。

## 2. 固定基线

### 2.1 OMO

- 仓库：`https://github.com/code-yeongyu/oh-my-openagent`
- 分支：`dev`
- Commit：`038ed0cbbefe2b40677b63867aeea0d16bc303e0`
- 版本：`5.0.0-beta.7`
- 许可证：`SUL-1.0`
- 固定日期：规划编制时固定，不随 `dev` 漂移。

关键真源：

- `ROADMAP.md`
- `packages/AGENTS.md`
- `packages/omo-opencode/src/**`
- `packages/boulder-state/src/**`
- `packages/*-core/**`
- `packages/omo-codex/**`
- `packages/omo-senpi/**`
- 对应 `*.test.ts`、`*.test.mjs`。

### 2.2 DSH

- 仓库：`https://github.com/deepseek-ai/deepseek-harness`
- Commit：`47f943859bef60e4160492346772ded9b24f765a`
- 版本：`0.1.0-rc.5`
- 许可证：MIT
- 状态：Developer Preview，官方明确说明会发生兼容性破坏。

关键真源：

- `packages/core/session/src/**`
- `packages/core/agent-loop/src/**`
- `packages/core/agent/src/**`
- `packages/core/system-prompt/src/**`
- `packages/core/tools/src/**`
- `packages/preset/agent-presets/src/**`
- `packages/subagent/**`
- `packages/goal/**`
- `packages/todo/**`
- `packages/compaction/**`
- `.agents/notes/implemented/**`
- 对应测试。

本地 DSH checkout 含与本规划无关的未提交修改，不能当作上游合同：

- `packages/client/connection/src/index.ts`
- `packages/sandbox/sandbox/src/escalation.ts`
- `packages/sandbox/sandbox/tests/escalation.spec.ts`

## 3. 真源优先级

```text
固定 revision 的现行源码
> 同 revision 的现行测试
> 对固定 revision 的行为回放/黑盒捕获
> 同 revision 生成的 AGENTS.md
> 普通文档、README、旧博客和口头描述
```

发现冲突时必须：

1. 在 `PARITY-MATRIX.md` 写出冲突；
2. 创建最小回放或测试；
3. 以现行源码和测试为兼容模式；
4. 若 DSH 目标要更强，使用独立配置开关并标注“DSH hardening”，不得宣称为精确对等。

## 4. 已核验的 OMO 事实

### 4.1 Core 包数量与边界

当前 `packages/AGENTS.md` 明确列出 **20 个 Core 包**：

1. `utils`
2. `model-core`
3. `prompts-core`
4. `rules-engine`
5. `agents-md-core`
6. `comment-checker-core`
7. `hashline-core`
8. `boulder-state`
9. `telemetry-core`
10. `lsp-core`
11. `mcp-stdio-core`
12. `tmux-core`
13. `claude-code-compat-core`
14. `skills-loader-core`
15. `mcp-client-core`
16. `openclaw-core`
17. `team-core`
18. `delegate-core`
19. `omo-config-core`
20. `memory-core`

`ROADMAP.md` 中仍有“19 Core”措辞，但其枚举也包含 19 个（当时未计 `memory-core`）；当前包级生成文档和实际目录应为本规划的真源。不得继续写“20 个且不含 memory-core”或“固定 19 个”。

`boulder-state` 和 `prompts-core` 的 package manifest 均无运行依赖；“零依赖”事实成立。其他 Core 不一定零依赖，只是 Harness-neutral。

### 4.2 `/start-work`

`packages/omo-opencode/src/hooks/start-work/start-work-hook.ts`：

- 仅处理带 `<session-context>` 和固定 marker 的真实 start-work 模板；
- 当前 Session 注册 Atlas 时切到 `atlas`，否则切到 `sisyphus`；
- 同时更新输出消息的 agent；
- 读取/创建 Boulder，解析计划名、worktree、PR/ship 选项；
- 用 marker 保证上下文注入幂等；
- 会从近期 Session 寻找 Prometheus 计划；
- 会在输出消息上 stamp 所选 execution agent；
- 会清理旧 stop-continuation 状态，并在需要时把 stale Prometheus Boulder agent 改写为有效 Atlas/Sisyphus execution role；
- background completion 的 resume/retry 仍回到同一个 Session，而不是新建替代 Session。

所以“Prometheus → `/start-work` → 当前会话后续以 Atlas 语义执行”是确切产品不变量，而不是仅复制计划到新 Session。其 Harness 机制不能机械泛化：OpenCode 会修改当前 Session 的 registered agent；Senpi 保持同一 Session，通过 persona/workflow transition 达到等价效果。DSH 应使用权威的 `omo/role` Session Event 和 role fold，而不是假装调用 OpenCode 式 agent-switch API。

Senpi 的 `packages/omo-senpi/src/components/task/skill-invocation-tracker.ts:createSkillInvocationTracker` 还暴露了一个迁移风险：若只观察 `SKILL.md` 读取或原始 `/skill:start-work` 文本，原生 activation 可能漏记，使 Metis/Momus review gate 错误保持开放。DSH 必须把命令解析后的 start-work activation 写成 Host 侧权威状态转换；不得从自然语言“start work”模糊推断，也不得仅靠 Skill 文件读取推断。

### 4.3 Boulder v2

`packages/boulder-state/src/types.ts`：

- 顶层含 `schema_version?: 2`、`active_work_id?`、`works?`；
- 同时保留 legacy/current mirror：`active_plan`、`started_at`、`session_ids`、`plan_name` 等；
- Work 状态：`active | completed | paused | abandoned`；
- Task Session 状态：`running | completed | cancelled`；
- 记录 worktree、session origin、agent、task session 和时间字段。

结构化计划语法由 `plan-checklist.ts` 精确限定：

- `## TODOs` 中只计顶层 `- [ ] 1. ...` / `- [x] 1. ...`；
- `## Final Verification Wave` 中只计 `- [ ] F1. ...`；
- fenced code block 内不计；
- H1/H2 是 section boundary；
- 出现任一结构化 section 后，格式不合规的 checkbox 不会进入进度；
- 没有结构化 section 时才退回“所有顶层 checkbox”简单模式。

计划 Renderer 和 Validator 必须逐字遵守这一语法，不能只说“兼容 Markdown checkbox”。

### 4.4 `task()` 兼容语义

`packages/omo-opencode/src/tools/delegate-task/**`：

- 参数：`description`、`prompt`、`category?`、`subagent_type?`、`run_in_background`、`task_id?`、`command?`、`load_skills`；
- 当前 `run_in_background` 省略时默认为 `false`（同步）；
- `load_skills` 省略时默认为 `[]`，显式 `null` 拒绝；
- 文档说 category/subagent_type 不应同时提供，但当前代码不是“同时提供就拒绝”：category 优先并把目标改为 Junior；
- 不能直接 `subagent_type="sisyphus-junior"`，Junior 由 category 选择；
- 不能把协调者作为子 Agent 目标；
- background 与 sync 具有不同 session/结果生命周期；
- 支持 fallback chain、session category registry、resume info、空结果检测和重试相关行为。

因此 DSH 兼容模式必须保留“category wins”行为，可发弃用警告；不能直接改成硬互斥后仍宣称对等。

### 4.5 角色、权限、Prompt 与模型修正

角色 cardinality 必须保持：Atlas 与 Prometheus 是 primary；Metis 与 Momus 是 subagent。不能把 Metis/Momus 暴露成可切换的主 Session 角色，也不能把 Atlas/Prometheus 当普通 reviewer child 启动。

Prometheus 的 agent permission map 本身较宽：`edit`、`bash`、`webfetch`、`question` 均为 allow。`prometheus-md-only` 只对其 `BLOCKED_TOOLS = [Write, Edit, write, edit]` 做路径限制，仅允许这些文件工具写 `.omo/*.md`；对 task/call_omo_agent 则注入 planning-only 警告。它并没有把普通 `bash` 从 permission map 中移除，因此不能错误宣称现行 OpenCode 已在执行层封死所有 shell 写入或 delegated implementation。迁移时必须保留 permission map、Write/Edit guard 和 delegation warning 的分层；若 DSH 额外禁止 state-changing shell 或硬拒绝规划委派实现，应作为显式 hardening profile/deviation 测试，不能冒充 exact parity。

OpenCode 的 Metis/Momus 都拒绝 `write`、`edit`、`apply_patch`，但保留 task delegation；Senpi profile 有意不同，其中 Metis 禁止 delegation。DSH 必须按目标兼容 profile 冻结权限，不得把 OpenCode 与 Senpi 合并成一个“绝对只读/绝不委派”规则。无论 Prompt 是否提及，写入拒绝都要由 tool filter + execution guard 强制。

Canonical model candidate/fallback chains 的真源是 `packages/model-core/src/agent-model-requirements.ts` 及其测试，而不是规划文档中的营销模型例子。Prometheus 使用单一 model-independent prompt；Atlas 才按 model family 选择 prompt variant 并注入 runtime category/agent/skill context。DSH 可用 capability alias 替代具体 Provider ID，但 route differential、candidate order、variant selection 与 fallback 行为必须由固定真源 fixture 证明。

`plugin-handlers/tool-config-handler.ts` 当前对 Atlas：

- `task: allow`
- `task_*: allow`
- `teammate: allow`
- `call_omo_agent: deny`

当前 Atlas agent config 没有在 agent 源码中直接禁止所有 write/edit。把 Atlas 强化成“只能委派、绝不写业务代码”是合理 DSH 产品硬化，但它是**有意偏差**，必须由 `atlas.directWritePolicy = "compat" | "deny-business-files"` 等开关表达并分别测试。

Junior 当前并非无条件 `maxDepth=0`：

- `call_omo_agent` 被允许；
- GPT Junior Prompt 明确允许研究型 `explore`、`librarian`、`oracle`；
- 禁止再次按 category 委派实现，而不是禁止一切子委派。

DSH 的对等实现应以“研究委派白名单 + 禁止实现递归”为默认兼容策略，而不是简单深度 0。若启用 `strictNoDelegation`，也要作为偏差记录。

### 4.6 Todo Continuation

`hooks/todo-continuation-enforcer/constants.ts`：

- skip：`prometheus`、`compaction`、`plan`
- cooldown：5 秒
- abort window：3 秒
- compaction guard：60 秒
- max stagnation：3
- max consecutive failures：5
- failure reset：5 分钟
- countdown：2 秒

当前决策门还检查：

- 已全部完成；
- recovery；
- cancel；
- 已交还的同步子 Session；
- token limit；
- unrecoverable request error；
- 最近 abort；
- 运行中/待唤醒后台任务；
- 无回答的问题；
- compaction epoch；
- 用户 `/stop-continuation`；
- 真实 Todo 进展；
- directive-only response；
- 用户中途插话；
- 冷却、指数退避、失败与停滞。

OMO 还有 Atlas 专用 Boulder continuation；不能只搬普通 Todo enforcer。

#### 已确认的 completion latch 源码/测试矛盾

固定 SHA 的 `idle-event.ts` 在 `incompleteCount === 0` 分支先执行 `state.allTodosCompletedAt = Date.now()`，紧接着调用 `sessionStateStore.resetContinuationProgress(sessionID)`；而真实 `session-state.ts` 的该函数会把 `state.allTodosCompletedAt` 设回 `undefined`。这与 `idle-event.test.ts` 中 `#4013 P0.1` 的回归合同冲突：第一次 idle 后 latch 应保留，第二次 idle 应在进入 Todo/注入路径前退出。该测试使用的 fake store 只记录 reset 调用，没有复刻真实 reset 的清 latch 副作用，因此静态测试仍可能通过而生产实现失效。

这是固定上游 revision 的**疑似实现缺陷**，不是要复刻的兼容行为。由于审计环境没有 Bun（exit 127），尚未执行上游 focused test；实现 OMO for DSH 时必须先写一个使用真实 state store 的回归测试，按 `#4013 P0.1` 的测试意图保留 completion latch，并把“重置进展计数”和“清除 completion latch”拆成不同 transition/API。只有权威 Todo mutation/event 表明 complete→incomplete、显式开始新 work、reset/cleanup Session，或其他定义的状态迁移时才能清 latch；不能要求后续 idle 在 latch 已短路后再靠轮询发现 reopen，重复 idle 也不得重新进入 continuation。

### 4.7 Hook 数量

当前 `config/schema/hooks.ts` 的 `HookNameSchema` 枚举 **56 个公开 `disabled_hooks` 配置名**。运行时组合并非与它一一对应：源码审计识别出约 58 个 constructed runtime hook slots，另有绕过 `disabled_hooks` 的 Team transform、无条件 context transform，以及作为嵌套开关的 `startup-toast`。文档中“约 54，开 Team/Monitor 约 62”是历史近似值，不能作为固定验收。迁移必须维护三份清单：公开配置名、实际 constructed slots、内部/无条件/嵌套行为，并以 drift test 固定例外。

### 4.8 Package/Release 审计修正

固定上游的 Core neutrality、package registration 与发布检查存在几类不能照搬的覆盖缺口：

- `shared-core-extraction-guard.test.ts` 的源码 forbidden patterns 比 manifest 检查更完整；manifest 侧只检查部分 family，不能证明依赖纯净。
- `package-registration-audit.test.ts` 主要按 manifest 建图且会跳过 undefined layer；无法发现未声明但实际 import 的 workspace 包。
- package layer/classification 在多处重复维护，容易 drift；目标必须有单一机器真源，并由它生成各审计清单。
- `omo-config-core` 是 Harness-API-neutral，但其 loader/schema 路径使用 Node runtime，必须放 DSH Host 或注入 runtime facilities。
- upstream publish workflow 缺 CI 的 Senpi compatibility gate；目标发布不能继承该缺口。
- `verify-npm-payload.mjs` 以 denylist 为主，且 alias manifest 可在验证后继续修改；目标必须验证**最终**每个 manifest variant 的 exact/required packed payload。
- generated schema freshness 应是 PR/CI/release fail-on-diff；不能靠发布流水线自动修复。
- unified runtime schema 故意把 `[opencode]` 保持为 `record<string, unknown>`，generated editor schema 才替换 legacy OpenCode schema。DSH Adapter 必须显式测试两层 validator 的差异。

这些是静态源码审计发现；审计环境无 Bun（exit 127），实施时仍需在具备 Bun 的固定 revision 环境运行原测试和新增回归套件。

### 4.9 许可证

根 `LICENSE.md` 为 Sustainable Use License 1.0：允许内部业务用途或非商业/个人用途；分发限制、notice 和 modified notice 均需遵守。实施前必须确定：

- `oh-my-dsh` 是否只作个人/内部使用；
- GitHub 仓库公开与否；
- 是否复制 OMO Core/Prompt，还是仅写洁净室兼容适配；
- 是否需要保留原许可证和显著修改声明；
- 商业使用/分发是否需要另行授权。

**Gate L0 未通过前，不得复制上游 Prompt 或 Core 源码进本仓库。** 本规划文档只引用行为和文件路径。

## 5. 已核验的 DSH 事实

### 5.1 Agent Preset 两平面

DSH Agent Preset 是每 Session 的组合：工具插件、persona/prompt section、compaction policy。Host 负责共享 registry、persistence、model route、subagent registry/providers、settings、sandbox、projection 等。

Preset 里的插件若发布 process-global Service，会被 mount safety 拒绝或发生跨 Session 冲突。OMO 的 `roleService` 若只服务 agent scope 可放 isolated preset realm；Boulder repository、跨 Session task registry、subagent provider 等必须在 Host。

Preset `recompose()` 不会自己检查 Agent 是否空白；产品 gateway 才执行“有历史后禁止换整套 Preset”。所以主角色切换绝不能用 Preset recompose。

### 5.2 日志化扩展事件

DSH 通过 TypeScript declaration merging 扩展 `SessionEventMap`。`Session.append()`：

- lossless JSON 验证；
- seq 连续；
- commit 后发 `session/event`；
- listener 失败不回滚已提交事件；
- seed replay 不重新发 live `session/event`；
- 历史读取与 live subscription 必须分开并用 seq 去重。

`omo/role`、`omo/continuation` 等事件可行，但都必须定义 invariant、fold、projection、replay tests 与未知版本策略。

### 5.3 Prompt、模型和工具

- Prompt section 按 order 组装，fiber scoped，支持动态 provider；
- `deployment:persona` 可在 agent scope shadow；
- `installModelSelection()` 在 prompt assembly 时捕获 route，并在同一步 `agent/request` 使用，避免并发角色切换造成 Prompt/模型撕裂；
- `agent/request` 是 route waterfall；`agent/request-error` 是 retry/recovery seam；DSH core 没有配置式 fallback chain；
- `tools/pre-execute` 是可组合 waterfall，`ctx.tools.guard()` 才是不可被后续 allow 覆盖的 monotonic guard；
- `tools/post-execute` 可接受/替换/增强/阻断归一化结果；
- `agent/turn-stopping` 可通过 `agent.steer()` 在同一 Turn 追加 step。

### 5.4 Subagent

One-shot start 支持的能力由 provider 显式声明：`outputSchema`、`depthLimit`、`toolFilter`、`persona`。不支持必须在启动前 fail loud。

- in-process provider 可支持全部四项；ACP provider 不支持这些可选项；
- one-shot background 返回 Job ID；continuable 返回 durable child Session ID；
- continuable 当前明确不支持 `outputSchema`；
- `send_message` 只排入后续 Turn，不能改变正在运行的 Turn；
- `interrupt_agent` 只取消当前 Turn、保留 inbox、不会删除 child，也不会取消 descendant；
- Job registry 默认 process-local，不可作为跨重启 task authority。

### 5.5 Goal、Todo、Persistence、Compaction

- Goal 由 durable `goal/change` 记录，但 activation 是 process-local，replay/resume 后默认 disarmed；
- Goal `id+revision` CAS；blocked 只机械检查最小轮数，不会自动证明“同一 blocker”；
- `todo/write` 是 whole-list last-write-wins 的 Session Log 事件，不是共享项目数据库；
- Todo standing projection 会在下一次 `turn/start` 清空，计划不能依赖它作为跨 Session authority；
- `turn/end` 不代表已 flush；重要状态切换后必须显式 durability checkpoint；
- Compaction 追加 surface replacement，不删除 canonical events；服务可选且不保证修复任意 oversized context。

## 6. 目标设计与有意增强

以下是本项目决定，不是现行 OMO 的逐字事实：

1. GPT Prometheus 访谈 → 用户批准 → Explore/Librarian 调研（可在澄清期按需启动）→ Metis mandatory gap analysis → Qwen Plan-Compiler → 根据持久化 `review_required` 条件调用 Momus/Oracle 的结构化流水线。该顺序是 DSH 目标编排；必须保留 OMO 的 approval 与 conditional review gates。
2. DS V4 Pro/Flash 专用 Prompt 变体和模型评测。
3. 可选 Atlas `deny-business-files` 硬化模式。
4. `plan_update`、`notepad_append`、`evidence_record` 专用工具，避免普通文件写入破坏格式或审计。
5. 使用 DSH Goal 作为辅助目标状态，但由 OMO continuation driver 决策完成。
6. 使用 DSH `agent/turn-stopping` 降低空闲续跑延迟，但仍保留跨 Turn/重启的 durable continuation state。

这些增强必须各自有开关、迁移说明、对等影响与 A/B 评测。

## 7. 仍需在实现阶段冻结的事项

- 目标 OMO monorepo 的实际工作分支与包发布策略；
- SUL 使用与公开分发结论；
- 部署可用 Provider/Model ID（不能硬编码营销名）；
- DSH 具体 profile 是否已装 continuable in-process provider；
- DSH Skill Registry 的目标部署清单；
- UI Slot 的实时 contract（实现 Client 前必须 Inspect）；
- Team Mode 是否先映射 OMO `team-core`，还是提供可选 DSH AgentTeams bridge；
- OpenClaw credential/endpoint 管理方式；
- Memory scope、删除和隐私策略；
- Windows 支持是否为首发门还是后续门。

## 8. 基线升级程序

升级任一上游 SHA 时必须执行：

1. 生成文件/导出/API/Hook/测试清单 diff；
2. 更新 `SOURCE-BASELINE.md`；
3. 逐行更新 `PARITY-MATRIX.md`；
4. 运行 `compat/dsh-api` 合同套件；
5. 运行 OMO differential replay；
6. 更新 Prompt manifest 与 model eval baseline；
7. 未通过时保留旧 SHA 支持，不得静默升级。
