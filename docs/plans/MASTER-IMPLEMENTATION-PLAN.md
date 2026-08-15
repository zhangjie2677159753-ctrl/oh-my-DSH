# OMO for DSH 主实施计划

## 0. 文档用途

这是交给 DeepSeek 实施的主计划。每个任务都有稳定 ID，并必须在机器可读 DAG 中补齐依赖、交付物和退出条件；正文摘要不保证逐任务重复全部字段。实现 Agent 不得自行跳阶段、合并 Gate 或把未验证假设写成既成事实。

## 1. 最终目标（North Star）

在固定 OMO 与 DSH revision 上交付一个可安装的 `packages/omo-dsh`，满足：

1. **完整 OMO 产品语义**：三条工作流、四个主角色、七个公开子角色、内部 Plan-Compiler、Category/Skill、Boulder、Continuation、Team/Memory/OpenClaw/Monitor 均有可追踪处置。
2. **同 Session 主角色切换**：Prometheus 讨论/规划后，`/start-work` 切到 Atlas，不复制或丢失会话上下文。
3. **统一 OMO `task()`**：保持固定 revision 参数、默认值、容错、后台/前台/恢复/取消/结果语义，并由 DSH Subagent 承载。
4. **三层状态清晰**：Boulder 是项目 authority；Session Log 是有序审计与恢复记录；Todo 是单 Session 当前工作投影。
5. **不完成不许停，但可正确停止**：未完成自动继续；用户插话、问题、取消、token/error、外部依赖和重复失败能阻止死循环。
6. **完成可证据化**：机器验证 + Atlas + Momus + Oracle（按任务策略）共同形成 final verification；执行者自报不等于完成。
7. **兼容与升级可控**：所有 DSH Developer Preview API 被 `compat/dsh-api` 隔离；每个支持 SHA 有合同测试。
8. **发布安全**：许可证、凭据、权限、隐私、回滚和可观测性 Gate 全部通过。

## 2. 非目标

- 不逐行翻译 56 个公开 Hook 配置项及其内部/组合 Hook；迁移其行为合同。
- 不 fork 或修改 DSH Core 来“方便适配”。
- 不在 License Gate 前复制 SUL-1.0 Prompt/Core 源码。
- 不把 DSH Todo 或 process-local Job 当 Boulder 替代。
- 不把所有小任务强制送入完整规划流水线。
- 不硬编码模型营销名、账号或 Provider availability。
- 不以 Prompt 声明替代权限/状态机。

## 3. 全局 Definition of Ready

进入任何实现 Epic 前必须满足：

- 上游 SHA 与本 Epic parity rows 已冻结；
- 相关 OMO source/test 路径已登记；
- 相关 DSH API 路径与 capability 已登记；
- 公开 DTO/schema 已写草案；
- acceptance、negative、replay/recovery cases 已列出；
- 不依赖未决许可证或 credential；
- 任务依赖已完成；
- 实施者能给出预期修改文件清单。

## 4. 全局 Definition of Done

一个任务仅在以下全部成立时完成：

- 实现、测试、文档在同一提交或可追踪提交链；
- 静态检查、单元和该域合同测试通过；
- 所有新工具 schema 只使用 DSH 支持的 JSON Schema 类型；
- 每个副作用都有 disposer/owner；
- error/cancel/timeout/retry 路径有测试；
- Session event 有 invariant、fold、replay、unknown-version 策略；
- 任何偏差写入 parity matrix；
- 不含 secret/debug/temp/node_modules；
- commit message 单一职责；
- acceptance evidence 记录命令、exit code、关键输出和 artifact path。

## 5. 阶段总览

| 阶段 | 名称 | 主要结果 | Gate |
|---|---|---|---|
| 0 | 治理与行为合同 | License、基线、parity oracle | G0 |
| 1 | Package/Compat 骨架 | 可 mount/unmount 的 adapter vertical slice | G1 |
| 2 | 日志化角色 Runtime | 四角色同 Session 原子切换 | G2 |
| 3 | 模型与 Prompt | capability route + DS/GPT/Qwen variants | G3 |
| 4 | `task()` 与子 Agent | 完整委派/控制/权限 | G4 |
| 5 | Planning | Prometheus structured pipeline | G5 |
| 6 | Work 闭环 | `/start-work`、Boulder、Atlas、Continuation、Verification | G6 |
| 7 | 工程增强 | Rules/AGENTS/Skills/Hashline/Comment/Compaction | G7 |
| 8 | 完整能力 | Memory/Team/Worktree/OpenClaw/Monitor/UI | G8 |
| 9 | 评测与发布 | Differential/model eval/migration/canary/rollback | G9 |

---

# 阶段 0：治理、许可证与行为合同

## Epic E00 — 固定基线和许可证

### OMO-0001 固定上游清单

- 依赖：无。
- 输出：`docs/upstream/omo-lock.json`、`docs/upstream/dsh-lock.json`。
- 内容：repo、commit、tree SHA、version、license、抓取日期、关键文件 digest。
- 验收：CI 校验 lock 指向的 tarball/tree；任何 SHA 漂移失败。

### OMO-0002 License Gate L0

- 依赖：0001。
- 输出：`docs/legal/USAGE-DECISION.md` 和适用 notices/modified notices 清单。
- 必答：内部/个人/商业？仓库 public/private？是否分发/发布 package/二进制？是否复制/改写 Prompt/Core？行为回放、测试 fixture、文档引用和派生内容如何处理？notice/modified notice 如何处理？
- 验收：项目 owner 与合格 legal reviewer 明确签字/记录具体 use/distribution/publication；规划本身不提供法律意见，也不能断言“clean-room adapter 自动不受许可证/版权义务影响”。
- 未通过时：不得公开仓库、分发或发布 artifact；不得复制上游 Prompt/Core。仅允许 legal 决策明确许可的本地研究/洁净室活动。
- 失败行为：public remote/publish job/copied prompt-core manifest/no-notice 在 L0 未通过时全部阻断。

### OMO-0003 建立真源索引

- 输出：OMO source/test path → behavior ID；DSH path/symbol/test → capability ID。
- 最少覆盖：role、task、Boulder、continuation、56 public hook names + constructed/internal hook inventory、config、prompt、team/memory/openclaw/monitor。

### OMO-0004 行为回放 Oracle

- 输出：`tests/fixtures/upstream/`、`tools/capture-omo-behavior.*`。
- 捕获：`/start-work`、plan parser、task normalization、permission maps、continuation decisions、config defaults。
- 原则：不把不稳定自由文本当 byte-exact oracle；状态/route/tool/事件可精确对比。

### OMO-0005 Parity 行级追踪

- 输出：机器可读 `parity.json` + 人读矩阵。
- 每行字段：ID、source、inputs、observable outputs、state change、permission、errors、recovery、DSH mapping、tests、status、deviation。

### OMO-0006 Machine-readable Task DAG

输出 `docs/plans/task-dag.json`，由 Schema/CI 验证：所有正文 `OMO-NNNN` ID 唯一且均有 node；每个 node 含 `epic`、`dependencies`（允许显式空数组）、`outputs`、`entryCriteria`、`exitCriteria`、`acceptanceIds`、`parityRows`、`ownerLane`；dependency ID 存在、无 cycle、所有 Gate 可从 roots 到达、Batch/Lane 只引用真实 ID。Markdown 的任务/Gate/Batch 清单从 DAG 生成或 drift-check，禁止 `110x`、范围表达遗漏新增任务、孤儿 node 或依赖未完成就 claim。

最小依赖骨架：`0001→0002/0003/0004`，`0003/0004→0005`，`0001/0003→0006`，`0002/0005/0006→G0`；`010x/020x` 依赖 G0；`030x` 依赖所需 `010x/0201..0207`。其余精确边在实现前由 owner/reviewer 从各 Epic 合同补齐并通过 CI，不能依赖段落顺序暗示。

### OMO-0007 Baseline Git/Review Gate

在实现前创建 reviewed planning baseline commit + annotated tag，生成所有规划/lock/parity/DAG 文件的 SHA-256 manifest；运行 working-tree、secret、Git history、credentialed-remote scan；配置 main branch protection、PR-only merge、required reviewer、required status checks 和禁止 force-push。验证远端 URL 无凭据。任何未提交/未追踪规划、缺 tag/hash、secret finding 或无法证明 review base 都阻断 Batch A。

### OMO-0008 Package Classification 与依赖真源

建立单一机器可读 package classification（neutral core、Harness adapter、platform/runtime package、application、binary/release-only），替换 `shared-core-extraction-guard.test.ts` 与 `package-registration-audit.test.ts` 中重复/不完整的手工清单。依赖审计必须：

- 解析 `dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies` 等全部 manifest dependency maps；
- 从集中 classification 推导 forbidden adapter families，不能只检查 `@opencode-ai/*` 和 `omo-codex`；
- 同时解析实际 TS/JS import specifier 建图，而不是只信 manifest；
- 对未声明 workspace import、未解析 import、undefined layer 和未分类 package fail closed；
- 覆盖每个普通包、platform package、adapter 和发布 alias；
- 检查 manifest graph 与 import graph 的不一致、环和违反层级方向。

`omo-config-core` 只能称为 Harness-API-neutral，不能称 browser/runtime-neutral：`loader/paths.ts`、`loader/types.ts`、`schema/task.ts`、`loader/loader.ts` 使用 Node runtime。目标必须明确它运行在 DSH Host Node plane；若未来放到其他 runtime，需注入 filesystem/path/process facility，不能让 Client bundle 隐式携带 Node 假设。

### G0 退出门

- Owner/legal License use/distribution/publication 决策完成；
- generated Hook inventories 已由固定 SHA 产生：56 个公开配置名、58 个 constructed slots、explicit exceptions；不能只凭手工“约 58”关闭 Gate；
- 20 个 Core package 均已逐包审计 Harness imports、runtime APIs、dependency graph 和 Host/Client placement；
- 关键提案修正已纳入；
- 10 个代表流程可从行为行追踪到测试。

---

# 阶段 1：Package 与 DSH Compat 骨架

## Epic E01 — Workspace 与构建

### OMO-0101 创建 `packages/omo-dsh`

交付目录：

```text
package.json, tsconfig.json, src/index.ts,
src/compat/, agent-presets/omo/, bundle/, tests/
```

验收：workspace install、typecheck、lint、unit test；不挂主 Profile。

### OMO-0102 配置 Schema

字段域：

- compatibility target OMO SHA；
- DSH supported SHA/range；
- primary role defaults；
- model aliases/routes/fallback；
- task concurrency/budgets；
- continuation constants；
- Atlas direct-write policy；
- integrations feature flags；
- telemetry/privacy。

验收：unknown keys fail；JSONC 行为按 `omo-config-core`；schema versioned；secret 字段只引用 credential name，不存值。

### OMO-0103 Tool Schema Linter

- 禁止 `type: json/text` 等非法类型；
- 验证 object-rooted output schema subset；
- 遍历全部注册工具；
- 单个非法 schema 必须在 build/CI 提前失败。

## Epic E02 — `compat/dsh-api`

### OMO-0201 Session Adapter

- 历史读取和 live append 分离；
- seq 去重与 read/subscribe race；
- append/flush/resume；
- required vs ignorable unknown event。

测试：seed replay、listener failure、reentrant append rejection、flush failure、resume transaction rollback。

### OMO-0202 Prompt/Inbox Adapter

- section/context/variable；
- inject/steer/followup 区分；
- role revision capture。

测试：scope shadow、dispose、complete collision、并发 role change 不撕裂。

### OMO-0203 Tool Pipeline Adapter

- register tool；
- pre waterfall；
- monotonic guard；
- around execute；
- post result。

测试：deny 不可被覆写、cancel settlement、error normalization、post replace restrictions。

### OMO-0204 Routing Adapter

- `agent/request`；
- `agent/request-error`；
- route DTO；
- retry 与 fallback 分离。

### OMO-0205 Subagent Adapter

- capability probe；
- one-shot/Job/continuable；
- persona/toolFilter/depth/output schema；
- send/interrupt/dispose。

测试：ACP capability rejection、continuable outputSchema rejection、interrupt 保留 inbox/descendant。

### OMO-0206 Goal/Todo/Persistence/Compaction Adapter

- Goal CAS；
- activation state；
- Todo whole-list；
- flush；
- compaction optional/capability。

### OMO-0207 Client/Projection Stub

阶段 1 只定义 DTO 和 Host Remote；不猜 Slot。

## Epic E03 — Vertical Slice

### OMO-0301 最小 Preset

- 一个静态 Sisyphus persona；
- `omo_status` read-only tool；
- 一个 Explore child；
- 一个 role event；
- 一个 Todo projection。

### OMO-0302 生命周期证明

流程：mount → 创建两个 Session → 各写 role → 启动 Explore → stop → resume → unmount。

验收：

- Session 不串；
- child 独立；
- stop 后无 listener/timer/job；
- resume 恢复 role；
- preset 没有 leaked global Service；
- shipped preset 未被修改。

### G1 退出门

- compat 最小 30 项合同套件通过；
- vertical slice 可在独立测试组合运行；
- 未挂载主运行 Profile；
- mount/unmount 资源计数相等。

---

# 阶段 2：日志化四角色 Runtime

## Epic E04 — Role Domain

### OMO-0401 Role Event/Invariant/Fold

实现：`omo/role` v1、严格 schema、revision 单调、合法 role/reason/changedBy、last-wins fold。

测试：空日志默认值、正常切换、stale revision、非法 role、seed replay、fork、未知 version。

### OMO-0402 Role Controller

API：`get(agent)`、`set(agent, role, reason, actor)`；set 先 append 后 flush；失败不得只改内存。

并发：per-Agent transition mutex + expected revision。

### OMO-0403 Prompt Router

四角色注册稳定 section 名；inactive role section 返回空文本而不是注册/注销工具。

### OMO-0404 Tool Guard

Role Policy Registry：工具组而非散落字符串。启动时验证所有 policy tool name 存在；unknown fail loud。

### OMO-0405 Model Router Binding

Prompt assembly 与 request route 使用相同 role snapshot；记录 role/prompt/route revision。

### OMO-0406 UI Projection

投影 role、phase、revision；冷读从 Session Log fold，不依赖 live memory。

## Epic E05 — Role Control Workflows

### OMO-0501 用户角色命令

- `/omo-role status`
- `/omo-role sisyphus|hephaestus|prometheus|atlas`

角色切换在活动 protected action 中 queued 或明确拒绝；不能半工具调用切换。

### OMO-0502 Resume/Fork Policy

- Resume：恢复原角色；
- Fork：默认继承角色，但 `changedBy=migration/system` 规则清楚；
- 角色 Event 是 log authority。

### G2 退出门

- 同一 Session 四角色往返 100 次无工具 catalog drift；
- resume/fork 正确；
- 并发 switch 无 hybrid prompt/model/guard；
- child 不能修改 parent role；
- UI 显示与 runtime authority 一致。

---

# 阶段 3：模型、Prompt 与 Runtime Fallback

## Epic E06 — Model Catalog

### OMO-0601 Capability Alias Config

每个 route 有 provider/model/capabilities/promptFamily/budget；启动时 probe availability。

### OMO-0602 Primary Role Routes

从 `model-core/src/agent-model-requirements.ts` 和 `model-requirements-agents.test.ts` 生成 canonical candidate/fallback fixtures，并在 DSH capability aliases 上重放 candidate order、availability、explicit override、category config、current/UI model、variant、reasoning/thinking/verbosity 与 runtime fallback。默认能力意图可配置：

- Sisyphus/Hephaestus/Atlas → deep tool-capable；
- Prometheus interview → high-quality conversational；
- 不把 marketing model name 作为 schema enum，也不能用上述抽象意图替代 upstream chain differential。

### OMO-0603 子角色和 Category Route

Quick/Explore/Librarian → fast；Oracle/Metis → deep；Momus/Compiler → structured/high-quality；Multimodal → vision。

## Epic E07 — Prompt Compiler

### OMO-0701 Semantic Contract Extraction

逐角色列 must/must-not/escalation/verification，不先复制原文。

### OMO-0702 DeepSeek V4 Variants

新增：

- `sisyphus/deepseek-v4.md`
- `atlas/deepseek-v4.md`
- `hephaestus/deepseek-v4.md`
- `junior/deepseek-v4-flash.md`
- continuation variant。

### OMO-0703 GPT/Qwen 适配与 Structured Variants

固定上游 Prometheus 使用一个 model-independent prompt；不能为不同 route 虚构“上游 Prometheus model-family variant”。如为 DSH GPT/Qwen 增加适配 section，必须标注 adapter enhancement、保持同一 semantic contract 并单独评测。Atlas 则必须保留 model-family prompt routing。Momus/Plan-Compiler 的结构化输出明确 schema，禁止自由 Markdown 冒充 IR。

### OMO-0704 Manifest/Snapshot

同 role/model/config 产生确定性 section list 和 hash；mandatory policy 不可被 override 删除。

## Epic E08 — Fallback

### OMO-0801 Error Classifier

transient、rate-limit、server、auth、policy、capability、context、schema、refusal、unknown。

### OMO-0802 Bounded Chain

每次 attempt 记录；capability filter；circuit breaker；最大 attempts；fallback 后重选 prompt family。

### OMO-0803 Ambiguous Failure Safety

模型调用失败可重试；工具已执行后的非幂等 side effect 不因模型 fallback 自动重放。

### G3 退出门

- fake provider chaos 全通过；
- 100% route explainable；
- vision/structured/tool capabilities 不静默降级；
- Prompt mandatory contract across families 100%；
- live smoke 验证每个已配置模型一次。

---

# 阶段 4：统一 `task()` 与完整子 Agent

## Epic E09 — Task Protocol

### OMO-0901 Compatibility Normalizer

精确实现：category wins；background 默认 false；skills 默认 []；null 拒绝；直接 Junior/primary coordinator 拒绝；description/prompt 校验。

### OMO-0902 Canonical Descriptor

持久字段：invocation、parent、child/job ID 类型、role/category、skills、route attempts、plan/task binding、status、timestamps、result digest。

### OMO-0903 Foreground

等待 child；stopReason 非 completed 为 failure；保留 partial output；empty result detector。

### OMO-0904 Background One-shot

返回 process-local Job ID；父 Session 日志记录 descriptor；重启后 Job 不可恢复要明确 terminal/lost，而非伪 running。

### OMO-0905 Continuable

返回 durable child Session identity/descriptor；send/interrupt 和后续 Turn continuation。必须区分 `discoverable`、`idle`、`running`、`lost-activation`、`reactivatable`：Session history/identity 可跨进程发现，不代表正在运行的 Turn/Provider activation 自动存活。冷启动时先 capability probe provider 是否能 reattach/reactivate；可以则以新 Turn 继续同一 child Session，不可以则保持可审计 terminal/lost 或请求显式重启策略，绝不伪称 live execution 已恢复。不允许 `outputSchema`。

### OMO-0906 Control Tools

- `task_output`
- `task_send`
- `task_cancel`
- 可选 `task_list`

权限必须验证 direct parent/ancestor，不仅靠 ID 猜测。

## Epic E10 — 子角色

角色 cardinality 是硬合同：Atlas/Prometheus 只能是 primary role；Metis/Momus 只能是 child subagent。启动阶段验证 registry，任何把前两者注册为普通 reviewer child，或把后两者暴露为 primary switch target 的配置都 fail loud。

每个角色重复以下任务模板：

1. 固定 OMO source prompt/permission/route contract；
2. 定义 persona；
3. 定义 allow/deny tools；
4. 定义 maxDepth/研究白名单；
5. 定义 output/result validator；
6. 添加正/负/绕过测试。

任务 ID：

- OMO-1001 Explore
- OMO-1002 Librarian
- OMO-1003 Oracle
- OMO-1004 Metis：OpenCode profile 硬拒绝 write/edit/apply_patch，但保留 task delegation；Senpi profile 禁止 delegation；分别做 visibility/execution 负测试
- OMO-1005 Momus：OpenCode profile 硬拒绝 write/edit/apply_patch，但保留 task delegation；Senpi one-shot/profile policy 单独冻结与测试
- OMO-1006 Multimodal-Looker
- OMO-1007 Sisyphus-Junior
- OMO-1008 internal Plan-Compiler

### Junior 特别合同

- 可写和测试；
- 不允许 category 实现递归；
- 兼容模式可委派 Explore/Librarian/Oracle；
- 不可调用 Team tools（除作为 Team member 的专门配置）；
- 结果必须给出 changed files、verification、risks。

## Epic E11 — 并发和预算

### OMO-1101 Concurrency/Budget/Orphan Runtime

- parent active children cap；
- provider/model cap；
- workspace writer lease；
- background notification dedupe；
- cancel/settlement race；
- orphan reconciler。

### G4 退出门

- 所有子角色独立 Session；
- Junior compat：直接按名委派 Explore/Librarian/Oracle 的正测试全部成功；嵌套 category 实现、Metis/Momus/Junior/primary 等非白名单角色在工具可见性和执行层均失败，证明不是仅靠 `maxDepth`；
- tool prompt visibility 与执行权限一致；
- 100% 权限负测试；
- 10 child 并发不超 cap；
- cancel/idempotent cleanup；
- restart 对 Job vs continuable 行为正确；
- OMO task fixture differential 通过。

---

# 阶段 5：Prometheus Planning

## Epic E12 — Plan IR/Renderer

### OMO-1201 Schema

实现 `OmoPlanV1`；object-rooted schema；ID/dependency/acceptance/evidence 验证。

### OMO-1202 Graph Validator

拒绝 cycle、unknown dependency、重复 ID、无 acceptance、无 final verification、不可执行 command（按 policy）。

### OMO-1203 Deterministic Renderer

严格 Boulder grammar；nested sections 不误计；round-trip IR → Markdown → progress。

### OMO-1204 Plan Storage

安全路径、atomic write、digest、revision、modified notice（如复制上游格式需遵守 License）。

## Epic E13 — Planning Pipeline

该 Epic 输出两个独立 conformance traces：`opencode-compat` 与可选 `dsh-structured-plan`。共同前缀是 interview → explicit approval → scaffold → mandatory Metis；compat 后由 Prometheus 写兼容计划，structured profile 才在 Metis 后调用 Plan-Compiler。任何测试或报告不得把两条轨迹混成一个顺序。

### OMO-1301 Interview

Prometheus 澄清真实目标、non-goals、assumptions；用户未批准/仍有问题不得创建最终计划或自动开工。澄清期可按上游合同使用只读研究，但 mandatory Metis plan critique 必须在用户批准后。

### OMO-1302 Research Fan-out

Explore/Librarian 并行，bounded query；结果带 source/evidence。

### OMO-1303 Metis

用户批准后先建立 plan scaffold，再执行 mandatory gap analysis；找遗漏、隐含意图、边界和风险并返回 structured findings。Metis 不得在 approval 前代替澄清，也不得被提升为 primary planner。

### OMO-1304 Plan Author/Optional Plan-Compiler

`opencode-compat`：Prometheus 根据 scaffold + Metis findings 写兼容计划。`dsh-structured-plan`：同一 gates 后由 Qwen Plan-Compiler 只返回 Plan IR，schema invalid 进入 bounded repair。两者输出分别留 trace，不能把 Compiler 设为 compat 必经组件。

### OMO-1305 Momus

检查验收、依赖、可执行性；明确 approve/reject/findings。

### OMO-1306 Oracle

独立架构审查；是否进入 Momus+Oracle 高精度 review 必须由持久化 `review_required`/明确用户选择和已冻结的 OMO 条件决定，不能因为 Adapter 自己觉得“复杂”而无记录地强制或跳过。

### OMO-1307 Repair/Approval

最大循环次数；review rejection 不得丢；用户批准生成 immutable handoff manifest。

### G5 退出门

- 简单计划不过度编排；复杂计划完整链；
- schema/graph/renderer 100%；
- Momus/Oracle 注入缺陷可拒绝；
- plan revision/digest 正确；
- approval 不能被 prompt injection 伪造；
- `/start-work` 能找到刚批准计划。

---

# 阶段 6：Boulder、Atlas、Continuation、Final Verification

## Epic E14 — Boulder Adapter

### OMO-1401 Core 封装

复用 `boulder-state`；禁止 domain 直接散落文件 I/O。

### OMO-1402 Multi-work/Legacy Mirror

维护 v2 works/active_work_id 和 mirror；读旧 state 迁移；未知新版本 read-only/fail。

### OMO-1403 Session/Task Link

parent/child session origins、task session state、worktree、timings。

### OMO-1404 Intent/Commit/Reconcile

崩溃点测试覆盖每个写入间隙。

## Epic E15 — `/start-work`

### OMO-1501 Command Parser

plan name、quoted name、worktree、make-pr/ship；保持上游 fixture。

### OMO-1502 Context Selection

显式 plan > recent session plan > active Boulder resume/choice；歧义必须问/列选项。

### OMO-1503 Authoritative Role Transition

在 DSH 中 append 权威 `omo/role=atlas`（Atlas 不可用时按兼容合同回退 Sisyphus）并 flush；后续 Turn/Continuation 必须读取该 fold。保持同一 Session 语义，不复制 OpenCode 私有 agent-switch API。Activation 只能来自解析成功的 `/start-work` Command/Host transition，不得从自然语言“start work”、`SKILL.md` 读取或 UI label 模糊推断；加入 native activation 漏记回归测试和幂等 context marker 测试。

### OMO-1504 Message/Boulder/Continuation Reconciliation

同一 transaction/reconcile protocol 还必须：

- 将所选 execution role stamp 到 outgoing message/projection；
- 清除上一轮 `/stop-continuation` 的 stale stop state；
- 把 legacy/stale Boulder `agent=prometheus` 改写为当前有效 Atlas/Sisyphus execution role，同时保留审计来源；
- background completion、resume 和 retry 绑定原 Session ID，不新建 replacement Session；
- 任一步 crash 后通过 intent/commit/reconcile 收敛 role event、message stamp、Boulder agent、stop state 和 plan binding。

### OMO-1505 Todo Projection

从下一个 incomplete top-level task 建 Atlas 当前 Todo；不能把全部项目状态塞 Todo。

## Epic E16 — Atlas Policy

每次测试/发布分别生成 `atlas-compat` 与 `atlas-deny-business-files` conformance report。Compat 只证明固定上游权限/行为；Hardened 额外证明直接写入限制和证据门。Hardened 的更强结果不能用于把 compat parity row 标 verified，反之亦然。项目级“机器证据后才能宣称 OMO for DSH 完成”是 DSH release hardening；若固定上游某路径仅 advisory，矩阵必须明确区别。

### OMO-1601 Compat Policy

精确保留 source permissions。

### OMO-1602 Hardened Policy

`deny-business-files`；专用 plan/notepad/evidence 工具。

### OMO-1603 Dependency Gate

只允许 ready task；并行 wave；writer lease。

### OMO-1604 Evidence Gate

任务完成要求 plan-defined evidence；child self-report 是候选。

### OMO-1605 Scope Change/Replan

plan contradiction、新 scope、destructive operation → escalate，不静默执行。

## Epic E17 — Continuation

### OMO-1701 Durable State/Event

状态 schema、fold、projection、stop/resume。

### OMO-1702 Turn-stopping Driver

同 Turn steer；检查 Todo/Boulder/children/questions/user interruption。

### OMO-1703 Idle/Restart Driver

settlement 或 resume 后继续；Goal 可辅助 armed/round budget，但 OMO driver 是 evaluator。

### OMO-1704 Backoff/Stagnation

复刻固定常量；fake clock tests；directive-only response 和无真实进展 pause。

### OMO-1705 Completion Latch Regression

先移植 `idle-event.test.ts` 的 `#4013 P0.1` 意图，再使用**真实** continuation state store 测试。不要照抄固定上游 `idle-event.ts` 中“设置 `allTodosCompletedAt` 后调用会清除它的 `resetContinuationProgress`”这一矛盾顺序。把 `resetProgressCounters` 与 `clearCompletionLatch` 拆分：首次观察到全部完成时原子写 latch 并清进展/失败计数但保留 latch；后续 idle 在读取 Todo/启动 countdown/注入前退出。只在权威 Todo mutation/event 表明 completed→incomplete、新 work 已显式开始、Session cleanup/reset 等声明过的 transition 清 latch；不能依赖已被 latch 短路的下一次 idle 再去轮询发现 reopen。测试必须覆盖真实 store、fake clock、连续两次 idle、Todo event 驱动的 complete→reopen→complete、restart/replay 和并发 idle。

### OMO-1706 External Blocker

credential、hardware、authorization、third-party outage → blocked，输出解除条件；不无限重复。

## Epic E18 — Final Verification

### OMO-1801 Verification Manifest

per task/final wave：test/type/lint/db/api/ui/security/custom。

### OMO-1802 Machine Runner

命令、exit code、output digest、artifact、timestamp、plan revision；禁止只存自然语言“通过”。

### OMO-1803 Independent Review

Momus acceptance + Oracle architecture/risk（按 policy）；reviewer read-only。

### OMO-1804 Completion Transaction

all tasks checked → verifying → final wave evidence → approve → Boulder complete → event/flush → final response。

### G6 退出门

- `/start-work` same Session 切换；
- crash/restart 无重复/漏任务；
- Atlas 两种 policy 都测；
- 用户插话/问题/stop/cancel 正确；
- DSH release/hardened profile 中无证据、stale evidence、failed command 均不能 complete；compat profile 单独与固定上游 completion contract 差分，不用 hardening 代填；
- external blocker 不死循环；
- 100-call 长任务无提前完成。

---

# 阶段 7：工程上下文与防错增强

## Epic E19 — Rules/AGENTS/Skills

- OMO-1901 rules discovery/security boundary；
- OMO-1902 AGENTS hierarchical merge；
- OMO-1903 DSH Skill Registry mapping；
- OMO-1904 category/agent skill filtering；
- OMO-1905 child minimal context envelope；
- OMO-1906 precedence/adversarial tests。

## Epic E20 — File/Edit Guards

- OMO-2001 read-before-write policy；
- OMO-2002 Prometheus plan-only guard profiles：compat 精确保留 broad permission map、Write/Edit 仅 `.omo/*.md`、delegation warning；可选 hardening 才拒绝 state-changing bash/委派实现，并登记 deviation；
- OMO-2003 notepad append-only tool；
- OMO-2004 Hashline stale/ambiguous guard；
- OMO-2005 bash file-read guard disposition；
- OMO-2006 JSON/edit error recovery；
- OMO-2007 Comment Checker post-execute/final gate。

## Epic E21 — Compaction/Resume

- OMO-2101 minimal resume context；
- OMO-2102 preserve role/work/plan/task/evidence/blocker；
- OMO-2103 token overflow/no retry；
- OMO-2104 compaction epoch guard；
- OMO-2105 compacted replay tests。

## Epic E22 — Hook Closure

逐行关闭 56 个公开 Hook 配置名，并关闭 constructed runtime slots 与内部/无条件/嵌套行为：native/adapt/emulate/not-applicable/deferred 均需测试或 ADR；不得以“DSH 原生更强”一句关闭。

### OMO-2201 Hook Inventory 与 QA Coverage Drift

在 G0 先由固定 SHA composer/schema extractor 生成并锁定 `hook-inventory.lock.json`；E22 负责把全部项绑定实现/测试并关闭。清单必须是 56 configurable、58 constructed、exception allowlist和独立 `hook-qa-coverage.json`。后者对每个行为记录 unit/contract/live replay test，不得把 `.agents/.../events-hooks.md` 的错误“21”计数或 Codex 默认 `sessionStart,userPromptSubmit`/ultrawork probe 当全覆盖。至少为 Stop、SubagentStop、`/start-work`、Todo continuation、Atlas continuation、background wake、compaction 和 cleanup 配置显式 live/contract scenario；inventory coverage 与 QA coverage 分开统计，二者都必须 100% 或获批 exception。

### OMO-2202 Runtime Residue Exclusion

扫描 source/package/publish payload 中的 runtime state；`.agents/background-tasks.json` 这类 checked-in stale `running` residue 必须排除、迁移为明确 fixture 或在 release fail。Task lifecycle 只能由源码、测试和 replay fixture 定义，不能把陈旧数据文件当 durable state 合同。

### G7 退出门

- nested AGENTS/rules fixtures；
- skill collision/privilege escalation blocked；
- existing write 无 read 被阻止（若 policy 开启）；
- plan/notepad 格式不能被普通 write 破坏；
- compaction 后可继续且不丢 evidence；
- Hook 三清单全部 closed，且 drift test 通过。

---

# 阶段 8：Memory、Team、OpenClaw、Monitor、UI

## Epic E23 — Memory

### OMO-2301 Memory Domain 与隐私

- scope：repo/user/session；
- consent、retention、redaction、delete；
- retrieval evidence；
- cross-session isolation；
- 不把 secret 写长期记忆。

### OMO-2302 Reflection/Dream Worker Least Privilege

以 Senpi `prepareReflectionForkSpawn` 为 High-risk fixture：context/prefix inheritance 与 capability inheritance 必须分离。定义 MemoryWorkerPolicy revision，明确只读 context envelope、允许的 memory read/write/commit operations、workspace boundary 和结果 schema；默认拒绝 task/delegation、task controls、Team、OpenClaw、credential/settings、privileged extensions、任意 skills/context-file discovery、parent role tools 与无关 filesystem/network tools。限制必须同时作用于 Prompt catalog 和 execution guard，不能只靠 `SENPI_MEMORY_REFLECTION` sentinel。

### OMO-2303 Cache-vs-Isolation Route

fork/reflection cost routing 必须先检查 `canNarrowCapabilitiesWhileReusingPrefix` capability。若 Provider/DSH child 无法证明 fork 后使用新的 allowlist/guard，就强制 isolated quick/reflection child 并记录 `cacheSacrificedForIsolation=true`；禁止为省 token 自动继承父 authority。兼容性 escape hatch 默认为 off，需要安全批准、可观察 warning 与独立风险登记。

### OMO-2304 Memory Worker Negative/Recovery Tests

- fork child 尝试 `task`、send/cancel、Team、extension tool、credential、parent business write：全部执行层拒绝；
- 父 Prompt/tool catalog 含 privileged tool 时 child 不可见且不可按 guessed name 执行；
- sentinel 只能阻止 recursive memory registration，移除/伪造 sentinel 不改变授权；
- parent cwd/symlink/path traversal 不扩大 workspace boundary；
- cache route 与 isolated route 产生等价 memory artifact/result schema；
- cancel/crash/timeout 不留 worker、worktree、lock、partial privileged side effect；
- fork/resume/replay 不恢复 parent capability snapshot。

## Epic E24 — Team/Worktree

### OMO-2401 Team Authority 与 Roster Snapshot

- OMO `team-core` authority；
- optional DSH AgentTeams backend；
- TeamRun 在 create 成功后持久化实际 roster snapshot、workflow policy revision 和 degradation/replacement reason；
- dispatch、barrier、wait、provenance、shutdown/cleanup 只遍历 actual roster，禁止硬编码 5/name list；
- member task/mailbox/status；
- worktree lifecycle；
- dependency DAG/deadlock；
- shutdown/orphan cleanup；
- 多写者 merge/conflict policy。

### OMO-2402 Hyperplan Lead/Planner Ownership

仅 main、lead-eligible primary 可启动 Hyperplan；Prometheus/plan child 不能编排 Team。Lead 运行 adversarial rounds 后只生成 owned insight bundle，不预写最终 task graph；以前台同步 `task(subagent_type="plan", run_in_background=false)` 交给独立 plan child。Plan child 不属于 Team、不能读取 mailbox，所有 surviving insights/open questions/provenance 必须在 handoff payload 中；其 plan output 按合同原样呈现，clarifying questions 原样转交。

### OMO-2403 Workflow-specific Cardinality

- Hyperplan normal：skeptic/validator/researcher/architect/creative 五人；
- `deep` unavailable：仅去掉 researcher，实际四人继续，所有 round/barrier/provenance/cleanup 使用四人 roster，提示 degraded mode；
- Security-research：不可少于五人；category unavailable 时替换为 `unspecified-high`，仍保持五人；
- 两条 workflow 的 fallback 不得合并为全局 Team policy。

## Epic E25 — OpenClaw

- feature flag off default；
- gateway/hook schema；
- credential service；
- timeout/retry/idempotency；
- main vs subagent session event rules；
- malicious payload/redaction；
- outage degraded mode。

## Epic E26 — Monitor

- start/stop/list/output；
- Session cleanup；
- status injection；
- duplicate intervention lease；
- observer 不直接改 complete authority。

## Epic E27 — Web UI

- Inspect actual Slots；
- role/work/task/child/continuation/evidence views；
- Host DTO Remote；
- replay/cold projection；
- Client disposer/HMR/build verification；
- no secret/raw prompt by default。

### G8 退出门

- privacy/threat review；
- Team 10-member soak 无 orphan；
- worktree conflict 可恢复；
- external outage 不影响 core completion correctness；
- UI refresh/replay 与 Host state 一致；
- stop/uninstall 无残留。

---

# 阶段 9：评测、迁移、发布

## Epic E28 — Test/Eval Harness

### OMO-2801 Multi-layer Test/Eval Harness

详见 `ACCEPTANCE-AND-EVALUATION.md`：unit、contract、integration、replay、chaos、differential、model eval、soak。

## Epic E29 — Migration

### OMO-2901 Config/State Migration and Downgrade

- OMO config dry-run mapping；
- state version migration；
- backup/export；
- idempotent rerun；
- downgrade read-only/reverse migration；
- active child/work handling。

## Epic E30 — Release Engineering

### OMO-3001 Compatibility Gate Parity

发布 workflow 必须包含 CI 的全部 adapter compatibility gates，特别是 Senpi compatibility；用生成的 required-gates manifest 防止 CI 与 publish workflow 漂移。任一支持 Adapter 未执行或失败都禁止发布。

### OMO-3002 Final Artifact Payload Contract

`verify-npm-payload.mjs` 式 denylist 不足。对每个最终发布 manifest variant（包括 `oh-my-openagent` alias）执行：生成/修改最终 manifest → `npm pack`/等价 pack → required/exact allowlist 校验 → 在干净临时 consumer 安装 → runtime import → `tsc --noEmit`。任何 alias 在验证后修改 manifest 都必须重新 pack 和重新验证；同时检查 exports/types/bin/files、平台二进制、license/notices、无 source-relative/未声明 workspace import。

把固定上游 `model-core` 作为 P1 必测回归：其 manifest 当前声明 `types: ./index.d.ts`，但 tarball/source 根没有该文件，只有 `src/index.ts`。Gate 必须同时验证：

- 每个 `exports` condition 与顶层 `types/main/module/bin` target 都存在于**最终 tarball**，大小写一致且未越出 package；
- TypeScript `node16`/`nodenext`（以及项目支持的 bundler resolution）能从干净 consumer `import type` 和 value import 公共 API；
- Node/目标 runtime 能解析 value export，不因直接指向未编译 `.ts` 或缺 declaration 失败；
- consumer 不得借助 Monorepo workspace symlink、root tsconfig path、源码目录或缓存“偶然通过”；
- 修复后加入 packed regression，源码 `bun test src/*.test.ts` 只能作为补充，不能关闭该 Gate。

### OMO-3003 Schema Freshness 和双层配置合同

Schema generation 必须在 PR/CI/release **fail on diff**，不得由 CI 自动修复或提交。为 DSH schema 使用独立 `$id`。显式测试：`omo-config-core` unified runtime schema 中 `[opencode]` 是 `record<string, unknown>`，而 generated editor JSON schema 会替换为 legacy OpenCode schema；Adapter 必须有自己的 runtime validator、editor schema 和两者允许差异的 fixture，不能宣称二者天然等价。

### OMO-3004 Release Metadata、Threat Gates 与供应链

Release blocker threat suite 必须覆盖：结构化 command/executable allowlist 与 shell injection；untrusted Plan/Rule/Skill/模型验证命令的批准与 digest binding；canonical path、worktree ownership、symlink/hardlink/mount/TOCTOU；stdout/stderr/evidence/artifact/child/UI/telemetry secret redaction；dependency pin/provenance/checksum/signature/禁止 floating install；telemetry/network egress allowlist、consent/opt-out、payload minimization/offline mode。任一失败不可用风险接受之外的平均分绕过。

- package publish metadata/notice；
- preset/bundle install；
- compatibility manifest；
- SBOM/third-party notices；
- signed/reproducible artifacts；
- changelog/known deviations；
- package classification/import graph report；
- 最终 packed artifact digest 与 consumer smoke evidence。

## Epic E31 — Canary/Rollback

### OMO-3101 Canary/Kill-switch/Rollback Drill

- opt-in alpha，不改 default preset；
- integration kill switches；
- old package/preset retained；
- state backup；
- rollback rehearsal；
- incident trace reconstruction。

### G9 / GA 门

- hard policy/permission/isolation 100%；
- deterministic contract ≥ 95%，其余有批准 exception；
- 每个支持模型族 role fidelity ≥ 90%；
- false-success < 1%；
- 100-tool-call corpus 无提前结束；
- chaos/soak 无 retry storm/orphan/state divergence；
- migration/rollback drill 通过；
- 无 P0/P1；
- Owner/legal 签署具体 use/distribution/publication；security/privacy/architecture/QA/release owners 批准逐 Profile parity report；
- optional/deferred 仅在该 Profile 明确 out-of-scope 且获批时不阻塞；hardening/enhancement 不填充 compat。

---

# 6. 推荐实施批次

## Batch A：Vertical Slice（必须先做）

`0001-0008 → 0101-0103 → 0201-0207 → 0301-0302`（真实依赖以 `task-dag.json` 为准，不把数字范围当 DAG）

只有它通过，才允许并行后续工作。

## Batch B：Role + Route 基础

`0401-0502` 与 `0601-0603` 可在 A 后并行；`0701` 依赖 parity contracts。

## Batch C：Task/Children

先协议和 Explore，再复制角色模板：`0901-0903 → 1001 → 0904-0906 → 1002-1008 → E11 并发/预算验收`。具体节点与依赖只引用 `task-dag.json` 中存在的 ID，不再使用不存在的 `110x` 占位 ID。

## Batch D：Planning + State

Plan IR/Renderer 与 Boulder adapter 可并行；Pipeline 等 child 完整后；Atlas/Continuation 等 approval manifest 后。

## Batch E：增强与完整能力

Context/guards 先于 Memory/Team/OpenClaw/UI。外部集成必须 feature flag off。

## Batch F：发布

Differential/model eval 从早期持续积累，但只有 E00-E27 完成才进入 GA 判定。

# 7. 风险登记

| ID | 风险 | 影响 | 缓解/触发停止 |
|---|---|---|---|
| R1 | SUL 不允许目标分发 | Critical | L0；必要时 private/internal 或洁净室重写/授权 |
| R2 | DSH SPI 破坏 | High | exact SHA + compat contract；失败不升级 |
| R3 | Role Prompt/route 撕裂 | Critical | assembly capture + revision tests |
| R4 | Atlas 只靠 Prompt | Critical | monotonic guard/adversarial suite |
| R5 | Boulder/Log/Todo 分歧 | High | intent/commit/reconcile + crash tests |
| R6 | Job 被误认为 durable | High | ID kind + restart-lost handling |
| R7 | fallback 重放 side effects | Critical | inference/tool boundary + idempotency |
| R8 | continuation 死循环 | High | stop/question/user/backoff/stagnation/blocker |
| R9 | 子 Agent 权限绕过 | Critical | tool visibility+execution same restriction；negative tests |
| R10 | Prompt 新模型不服从 | High | per-family eval、threshold、rollback |
| R11 | Team 多写者冲突 | High | worktree/lease/merge policy |
| R12 | secret 泄露 | Critical | credential refs、redaction、log scan |
| R13 | scope 无边界膨胀 | High | parity rows/gates，不完成行不得称 GA |
| R14 | UI SPI 猜错 | Medium | implementation-time Inspect + adapter |
| R15 | 旧文档误导 | High | source/test priority + differential fixtures |
| R16 | DSH persistence restore 拒绝未标记 ignorable 的未知 Session 事件；append 无 ignorable 入口 | High | Boulder 镜像 reconciliation；跟踪上游 event-type 注册面；未解决前不宣称 stock 跨重启恢复 parity |

# 8. 最终交付物

- `packages/omo-dsh` source/package/preset/bundle；
- 20 Core 依赖/适配决策清单；
- 56 public hook names + constructed/internal hook disposition report；
- OMO/DSH compatibility manifest；
- role/prompt/model manifests；
- task/subagent contracts；
- plan schema/renderer/validator；
- Boulder/continuation/verification state machines；
- unit/contract/integration/replay/chaos/model-eval suites；
- migration/backup/rollback tools；
- security/privacy/license/threat model；
- operator/user docs；
- final signed parity conformance report。
