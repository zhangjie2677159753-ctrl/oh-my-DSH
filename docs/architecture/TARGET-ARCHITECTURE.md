# OMO for DSH 目标架构

## 1. 架构目标

在不修改 DSH Core、不把 OpenCode 历史 Hook 结构原样复制到 DSH 的前提下，实现固定 OMO revision 的完整可观察行为对等。迁移单位是：

- Role/Persona；
- Prompt 行为合同；
- Tool/Permission 合同；
- 状态机；
- 持久化与恢复；
- 委派、取消、续跑和失败语义；
- 用户工作流；
- 机器可验证的完成门。

## 2. 物理归属

实现应进入 OMO Monorepo：

```text
packages/omo-dsh/
```

而不是 fork DSH。`oh-my-dsh` 仓库作为规划、实验、兼容报告和后续同步入口；真正可复用的 Adapter 最终合入 OMO Monorepo 或以其 workspace 依赖方式开发。

## 3. Host / Agent 两平面

### 3.1 Host Plane

必须 process-global 或跨 Session 的能力：

- DSH registries：tools、systemPrompt、agents、sessions、subagents；
- Session persistence / query / projections；
- LLM providers 与 route backend；
- Subagent registry 和 provider；
- OMO Boulder repository；
- OMO task registry/continuation descriptor registry；
- memory/team/openclaw shared services；
- settings、credentials、telemetry；
- Sandbox/approval；
- Web host / Client Remote API。

### 3.2 Agent Preset Plane

单个 Agent/Session 对 Host registry 的贡献：

- OMO persona placeholder；
- 角色 Prompt sections；
- `task()` 和 OMO 专用工具；
- tool guard listeners；
- role/model router middleware；
- continuation listener；
- context/rules injection；
- compaction policy；
- Agent-local projection contribution。

**禁止**在 Preset 中重新发布 process-global registry/service。若 role controller 以 Service 形式实现，必须是 per-agent isolated service 且没有 Host/其他 Session consumer；更稳妥的设计是纯 fold + AgentScope controller。

## 4. 单一 Preset，日志化 Primary Role

```text
OMO Agent Preset
├── sisyphus
├── hephaestus
├── prometheus
└── atlas
```

四角色共享稳定工具目录。切换角色不是 `agentPresets.recompose()`，而是写入 Session Log：

```ts
type OmoPrimaryRole =
  | 'sisyphus'
  | 'hephaestus'
  | 'prometheus'
  | 'atlas'

type OmoRoleChangedBy =
  | 'user'
  | 'start-work'
  | 'system'
  | 'migration'

interface OmoRoleSnapshotV1 {
  schemaVersion: 1
  role: OmoPrimaryRole
  revision: number
  changedBy: OmoRoleChangedBy
  reason: string
  changedAt: string
}
```

Session Event：

```ts
'omo/role': OmoRoleSnapshotV1
```

### 4.1 原子角色边界

角色切换按“下一次 prompt assembly 边界”生效：

1. `omo/role` 事件提交并 flush；
2. role fold 的 `current` 更新；
3. prompt assembly 读取同一 role snapshot；
4. model selection 捕获同一 snapshot 对应 route；
5. tool guard 在该 step 内使用 frozen role revision；
6. 并发的新 role event 只能影响后续 step。

每个 `request/context` 或 OMO 专用 route event 必须记录 `roleRevision`、prompt revision、route policy revision，便于重放证明没有 hybrid state。

### 4.2 四个统一消费者

```text
Role Fold
  ├── Prompt Router：角色 + 模型族 → section manifest
  ├── Model Router：角色 + category + availability → provider/model
  ├── Tool Guard：角色 + plan/work state → allow/deny/escalate
  └── UI Projection：名称、颜色、phase、active work
```

UI 名称只是投影，不是权限真源。

## 5. Prompt 架构

Prompt 使用 DSH ordered sections，而非一个千行拼接字符串：

| Order | Section | 内容 |
|---:|---|---|
| 10 | `omo:identity` | OMO/角色身份 |
| 20 | `omo:role` | 角色职责和非职责 |
| 30 | `omo:operating-principles` | 调研、推进、证据 |
| 40 | `omo:planning-policy` | 计划策略；按角色可为空 |
| 50 | `omo:delegation-policy` | category/agent/skill 规则 |
| 60 | `omo:verification-policy` | 机器验证与独立验收 |
| 70 | `omo:continuation-policy` | 完成与停止条件 |
| 80 | `omo:catalog` | 动态 category/agent/skill |
| 90 | `omo:boulder-context` | 当前 Work 的最小 owned DTO |
| 100 | `omo:project-context` | 相关 AGENTS/rules |

Prompt Manifest：

```ts
interface PromptManifest {
  role: string
  modelFamily: string
  semanticRevision: string
  variantRevision: string
  sectionHashes: Record<string, string>
  requiredPolicies: string[]
}
```

硬权限不能从 Prompt 解析，必须来自 role policy registry。

## 6. 模型路由与 fallback

模型 ID 由配置决定，不硬编码“GPT”“Qwen3.8-Max”“DS V4 Pro Max”等营销名：

```ts
interface OmoModelAlias {
  provider: string
  model: string
  capabilities: Array<'text' | 'tools' | 'vision' | 'structured-output'>
  contextWindow?: number
  costClass?: 'flash' | 'standard' | 'pro'
  promptFamily: 'deepseek-v4' | 'gpt' | 'qwen' | 'generic'
}
```

建议别名：`primary.deep`、`primary.fast`、`planning.interview`、`planning.compiler`、`vision.default`。

DSH `agent/request-error` 只提供恢复 seam，OMO Runtime Fallback 维护自己的有界状态机：

```text
attempt
→ classify error
→ retry same route? / choose next compatible route? / terminal
→ bind new prompt family to new route
→ log attempt
```

禁止：

- capability 不匹配仍静默降级；
- auth/policy denial 盲目跨 Provider；
- provider 失败后重放已经执行过的非幂等工具；
- fallback 模型换了但 Prompt 仍用旧模型 variant；
- route 环路。

## 7. 子 Agent 架构

### 7.1 子角色

| Role | 默认能力 | 写入 | 委派 |
|---|---|---|---|
| Explore | 仓库只读搜索/LSP read | 禁止 | 禁止 |
| Librarian | 外部资料/开源代码只读 | 禁止 | 禁止 |
| Oracle | 高质量架构咨询 | 禁止 | 兼容模式按上游白名单 |
| Metis | 需求缺口与隐含意图 | 禁止 | 只允许研究白名单（按上游合同冻结） |
| Momus | 计划/验收审查 | 禁止 | 按上游合同冻结 |
| Multimodal-Looker | 图片/PDF/UI/图表 | 禁止业务源码 | 禁止 |
| Sisyphus-Junior | 原子实现与验证 | 允许 | 只允许 Explore/Librarian/Oracle 研究，禁止 category 实现递归 |
| Plan-Compiler | 结构化计划编译 | 只返回 schema | 禁止公开委派 |

### 7.2 统一 `task()` facade

Model-facing 输入兼容 OMO：

```ts
interface OmoTaskArgs {
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  run_in_background?: boolean // compat default false
  task_id?: string
  command?: string
  load_skills?: string[]      // compat default []，null 拒绝
}
```

内部 canonical request：

```ts
interface OmoTaskRequest {
  invocationId: string
  parentSessionId: string
  requestedCategory?: string
  requestedRole?: string
  resolvedRole: string
  objective: string
  description: string
  skills: string[]
  executionMode: 'foreground' | 'background-one-shot' | 'continuable'
  route: OmoModelAlias
  personaRevision: string
  toolPolicyRevision: string
  maxDepth?: number
  outputContract?: JsonObjectSchema
  planId?: string
  planRevision?: string
  taskKey?: string
}
```

解析顺序：

1. validate description/prompt；
2. apply compatibility normalization；
3. category 存在时 category wins，选择 Junior；
4. 否则解析 subagent type；
5. 拒绝 primary coordinator 和直接 Junior；
6. 解析 Skills；
7. 解析模型和 fallback；
8. 检查 provider capabilities；
9. 设置 persona/tool filter/depth；
10. 启动 DSH child；
11. 建立 task/child descriptor；
12. 返回 sync result、Job ID 或 durable Session ID。

`task_output`、`task_send`、`task_cancel` 对 Job/continuable 的不同 ID 类型必须显式标注，不能把 process-local Job ID 当 durable task ID。

## 8. Prometheus 规划流水线

DSH 目标内部流水线：

```text
GPT Prometheus interview + optional Explore/Librarian context
→ explicit user approval to create the plan
→ mandatory Metis gap analysis
→ Qwen Plan-Compiler (structured IR)
→ deterministic validate + render
→ if review_required: Momus acceptance review + independent Oracle review
→ bounded repair loop / user review
→ approved handoff
```

这是 DSH 目标增强；对外必须保持 OMO 的规划行为合同、计划位置、格式和 `/start-work` 语义。

### 8.1 Plan IR

```ts
interface OmoPlanV1 {
  schemaVersion: 1
  planId: string
  revision: number
  title: string
  goal: string
  successCriteria: string[]
  assumptions: string[]
  nonGoals: string[]
  architectureDecisions: Array<{ decision: string; rationale: string }>
  risks: Array<{ id: string; risk: string; mitigation: string }>
  tasks: Array<{
    id: `T${number}`
    title: string
    objective: string
    dependsOn: string[]
    affectedAreas: string[]
    implementationNotes: string[]
    acceptance: string[]
    negativeTests: string[]
    verificationCommands: string[]
    evidenceRequired: string[]
    recommendedCategory?: string
    recommendedSkills?: string[]
  }>
  finalVerification: Array<{
    id: `F${number}`
    title: string
    acceptance: string[]
    verificationCommands: string[]
  }>
}
```

Renderer 保证精确输出：

```markdown
## TODOs
- [ ] 1. ...
...
## Final Verification Wave
- [ ] F1. ...
```

嵌套验收项不得使用会被 Boulder 误计的顶层格式。

### 8.2 Approval

Approved Plan Manifest：

```ts
{
  planId,
  planRevision,
  markdownDigest,
  irDigest,
  approvedAt,
  approvedBy,
  reviewResults,
  sourceSessionId
}
```

Atlas 所有执行和证据都绑定此 manifest；计划修改必须重新编译/审查/批准。

## 9. 三层状态与 authority

| 层 | Authority | 范围 | 恢复 |
|---|---|---|---|
| Boulder | 项目计划、Work、跨 Session/Worktree 进度 | 项目级 | 文件/存储持久化 |
| DSH Session Log | 对话、角色、路由、工具、child link、证据事件 | Session | persistence replay |
| DSH Todo | 当前 Session 当前工作视图 | 单 Session/回合投影 | latest snapshot；不得当项目 authority |

### 9.1 一致性策略

不能跨文件 Boulder 与 Session Log 做真正数据库事务，因此使用 revision + intent/commit/reconcile：

```text
omo/work-transition-intent (session log)
→ write Boulder with transitionId/revision
→ omo/work-transition-committed
→ flush session
→ update Todo projection
```

恢复时：

- intent 无 Boulder：安全重试；
- Boulder 有 transition、无 commit：补 commit；
- Todo 不一致：从 Boulder 重建；
- digest/plan revision 冲突：进入 paused/corrupt，不自动推进。

## 10. Atlas Guard

Authority hierarchy：

```text
安全/审批政策
> 已批准计划与 OMO runtime guard
> 角色 policy
> 项目 rules/AGENTS/skills
> Prompt
> 用户/工具输出中的非可信文本
```

Guard decisions：

```ts
type GuardDecision =
  | { kind: 'allow'; ruleId: string }
  | { kind: 'deny'; ruleId: string; reason: string }
  | { kind: 'escalate'; ruleId: string; reason: string; target: 'replan' | 'user' | 'expert' }
```

两种 Atlas 兼容策略：

- `compat`：精确跟随固定 OMO source 能力；
- `deny-business-files`：禁止直接 edit/write 业务代码，只允许读取、验证、task、plan/notepad/evidence 工具。

专用工具：

- `plan_update`
- `notepad_append`
- `evidence_record`
- `work_block`
- `work_resume`

任何直接文件写入不能代替这些状态变更。

## 11. Continuation 状态机

DSH 必须同时支持：

1. `agent/turn-stopping` 同 Turn steer；
2. idle/settlement 后新 Turn；
3. process restart 后显式 resume/rearm；
4. child settlement 触发 parent wake；
5. `/stop-continuation` durable stop。

状态至少包含：

```ts
interface OmoContinuationStateV1 {
  schemaVersion: 1
  workId: string
  status: 'active' | 'paused' | 'stopped' | 'blocked' | 'verifying' | 'complete'
  revision: number
  lastIncompleteDigest?: string
  lastProgressAt?: string
  lastInjectedAt?: string
  consecutiveFailures: number
  stagnationCount: number
  awaitingProgressCheck: boolean
  responseObserved: boolean
  blockReason?: 'user-interruption' | 'directive-response' | 'question' | 'external' | 'token-limit' | 'unrecoverable'
  compactionEpoch?: number
}
```

继续前必须依次检查：

- work/role/session ownership；
- user stop/cancel/interruption；
- pending question；
- background/child activity；
- compaction/recovery；
- token/error class；
- Todo/Boulder 实际进展；
- cooldown/backoff/stagnation/failure budget；
- external blocker；
- final verification gate。

“所有 checkbox 已勾”仅进入 `verifying`，不直接 complete。

## 12. Context、Rules、Skills、Memory

- AGENTS/rules：先用 OMO Core 发现/匹配，转成最小 owned text context，禁止 live DSH object；
- Skills：通过 DSH Skill Registry 发现与显式加载，保留 OMO skill filtering/agent/category 规则；
- MCP：优先 DSH MCP 生命周期；仅保留 Skill-MCP 产品语义；
- Hashline：复用 Core 解析/校验，stale/ambiguous 必须 fail closed；
- Comment Checker：post-execute + final verification；不自动修改源码；
- Memory：明确 repo/user/session scope、consent、redaction、retention、delete；
- Compaction resume：注入 current role、work、plan revision、next task、recent evidence 与 blockers 的最小快照。

## 13. Team、Worktree、OpenClaw、Monitor

- Team 的计划/task/mailbox/worktree authority 默认来自 OMO `team-core`；
- DSH AgentTeams bridge 是可选后端，不应让两套 task authority 同时写；
- 多写者必须使用独立 worktree 或声明 single-writer lease；
- OpenClaw 为 feature-flagged 外部 integration，严格 schema/timeout/credential redaction；
- Monitor 是 observer/watchdog，不能跳过 guard 直接写 authoritative completion；
- Session 删除/停止时清理 monitor、child、terminal、timer、listeners。

## 14. UI/Projection

Host projection 输出 owned DTO：

```ts
interface OmoSessionProjection {
  role: { name: OmoPrimaryRole; revision: number }
  phase: 'normal' | 'planning' | 'executing' | 'verifying' | 'blocked'
  work?: { id: string; planName: string; completed: number; total: number }
  activeChildren: number
  continuation: { status: string; attempts: number }
  latestVerification?: { status: string; at: string }
}
```

Client UI 显示：当前角色、计划进度、child/task、continuation、证据与阻塞。实现前必须查询实时 Slot contract；Client 不直接读取 Boulder 文件或 DSH live objects。

## 15. `compat/dsh-api.ts` 隔离面

所有 DSH import、event strings、union、Service、Slot、Remote descriptor 集中在：

```text
src/compat/
├── dsh-api.ts
├── capabilities.ts
├── session.ts
├── prompt.ts
├── routing.ts
├── tools.ts
├── subagents.ts
├── persistence.ts
├── goals-todos.ts
└── client.ts
```

规则：

1. OMO domain 只依赖 OMO-owned DTO；
2. runtime validation；
3. optional service capability probe；
4. history/live stream 分离并用 seq 去重；
5. cancellation、disposal、flush 分离；
6. one-shot/background/continuable 分离；
7. upgrade exact DSH SHA 前跑 compatibility contract suite；
8. 未知 required Session event fail；ignorable 才可跳过；
9. 不依赖 HostFrame、Slot props 或 declaration merging 作为稳定公共 ABI。

## 16. 目标目录

```text
packages/omo-dsh/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── compat/
│   ├── role/
│   ├── agents/
│   ├── routing/
│   ├── delegation/
│   ├── planning/
│   ├── work/
│   ├── context/
│   ├── guards/
│   ├── integrations/
│   └── ui/
├── prompts/
├── agent-presets/omo/
├── bundle/
├── skills/
└── tests/
    ├── unit/
    ├── contract/
    ├── integration/
    ├── replay/
    ├── chaos/
    └── model-eval/
```

## 17. 架构完成判定

架构不是“文件建好了”即完成，而必须证明：

- 同 Session 四角色原子切换、resume 不丢；
- 工具 schema 在切换时稳定；
- Prompt/模型/guard 绑定同一 role revision；
- child 真独立且权限不可绕过；
- Boulder/Log/Todo 崩溃恢复可收敛；
- Atlas 无证据不能完成；
- 用户插话/问题/外部阻塞能停止自动续跑；
- stop/update/unmount 后没有 listener、timer、child、job、monitor 泄漏；
- DSH revision 升级不通过 compat contract 时拒绝发布。
