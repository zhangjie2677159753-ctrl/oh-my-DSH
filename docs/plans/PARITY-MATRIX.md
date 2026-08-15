# OMO → DSH 功能对等矩阵

## 1. 使用规则

本矩阵是 release authority，不是说明性 checklist。每行必须处于以下一个状态：

- `not-started`
- `verified-contract`
- `implemented`
- `native-equivalent`
- `intentional-deviation`
- `blocked`
- `verified`

`native-equivalent` 仍必须有等价证明；`intentional-deviation` 必须有 ADR、配置开关、迁移与评测；`blocked` 必须有具体阻塞和 owner。只有 `verified` 才能计入 GA parity。

建议机器可读字段：

```json
{
  "id": "PAR-ROLE-001",
  "source": ["path:symbol", "test:name"],
  "inputs": [],
  "outputs": [],
  "state": [],
  "permissions": [],
  "failure": [],
  "recovery": [],
  "dshMapping": [],
  "tests": [],
  "status": "not-started",
  "deviation": null
}
```

## 2. 能力域矩阵

| ID | OMO 行为合同 | 固定真源 | DSH 目标映射 | 关键验收 | 初始状态 |
|---|---|---|---|---|---|
| PAR-GOV-001 | 固定 revision 行为对等 | OMO/DSH commit lock | compatibility manifest | SHA 漂移 CI fail | verified-contract |
| PAR-GOV-002 | SUL 使用/分发限制 | `LICENSE.md` | License Gate L0 | 未批准不复制 Core/Prompt | verified-contract |
| PAR-CORE-001 | 20 个 Harness-neutral Core | `packages/AGENTS.md`, extraction guard | workspace dependencies/adapter | 每包 reuse/adapt/native 决策 | verified-contract |
| PAR-ROLE-001 | 四 Primary Role | agent factories/config builders | `omo/role` + router | same Session atomic switch | verified-contract |
| PAR-ROLE-002 | `/start-work` Atlas fallback Sisyphus | `start-work-hook.ts` + tests | DSH command + role event | Session ID 保持 | verified-contract |
| PAR-ROLE-003 | Resume 角色 | DSH Session replay target | role fold | process restart restore | not-started |
| PAR-PROMPT-001 | Prompt model variants/runtime injection | `prompts-core`, agent prompts | ordered sections/compiler | manifest/hash/policy snapshots | not-started |
| PAR-MODEL-001 | agent/category model requirements | `model-core` | model alias/capability router | route differential | not-started |
| PAR-MODEL-002 | runtime fallback | OMO fallback hooks | `agent/request-error` controller | bounded/no loop/no side effect replay | not-started |
| PAR-TASK-001 | `task()` normalize/defaults | delegate-task source/tests | OMO facade | category wins; defaults match | verified-contract |
| PAR-TASK-002 | sync task | delegate sync executor | one-shot foreground | partial/error/result footer | not-started |
| PAR-TASK-003 | background task | background manager | DSH Job + descriptor | process-local semantics explicit | not-started |
| PAR-TASK-004 | continuable child | OMO resume/task control | DSH continuable Session | send/interrupt/resume authority | not-started |
| PAR-TASK-005 | queue/progress/promotion/residency | senpi-task/core | task runtime | cap/queue/budget tests | not-started |
| PAR-AGENT-001 | Explore read-only search | agent source/tests | child persona/filter | write/delegate denial | not-started |
| PAR-AGENT-002 | Librarian external research | source/tests | child persona/filter | source citations/no write | not-started |
| PAR-AGENT-003 | Oracle consultation | source/tests | child persona/filter | read-only, route, output | not-started |
| PAR-AGENT-004 | Metis gap analysis | source/tests | child structured result | no source write | not-started |
| PAR-AGENT-005 | Momus plan review | source/tests | saved-plan-path review | approve/reject contract | not-started |
| PAR-AGENT-006 | Multimodal | source/tests | vision child | text-only no silent degrade | not-started |
| PAR-AGENT-007 | Junior implementation/research delegation | junior prompt/source | child write + research allowlist | category recursion deny | verified-contract |
| PAR-PLAN-001 | Prometheus plan role | prompt/config | same Session planning phase | no implementation before approval | not-started |
| PAR-PLAN-002 | approval → Metis | ulw-plan workflow | planning pipeline gate | Metis not before approval | verified-contract |
| PAR-PLAN-003 | conditional Momus/Oracle review | workflow review_required | policy gate | not universally invoked | verified-contract |
| PAR-PLAN-004 | deterministic Plan IR/Renderer | DSH enhancement | Plan-Compiler | exact Boulder grammar | intentional-deviation |
| PAR-BOULDER-001 | Boulder v2 + legacy mirror | `boulder-state/types.ts` | Core adapter | unknown fields preserved | verified-contract |
| PAR-BOULDER-002 | structured checklist parser | `plan-checklist.ts` + tests | reuse Core | exact regex/fence/boundary | verified-contract |
| PAR-BOULDER-003 | session origins/task sessions/worktree | state/storage | repository | resume/reconcile | not-started |
| PAR-CONT-001 | generic Todo continuation | hook source/tests | turn-stopping + idle driver | full safeguard matrix | verified-contract |
| PAR-CONT-002 | Atlas Boulder continuation | atlas hook | work driver | final wave/child/blocker | not-started |
| PAR-CONT-003 | stop continuation | command/guard | durable stop state | countdown race stop | not-started |
| PAR-CONT-004 | external blocker escape | Codex behavior | blocked transition | no loop | not-started |
| PAR-VERIFY-001 | task evidence | Atlas/current tests | evidence store | stale/failed rejected | not-started |
| PAR-VERIFY-002 | Final Verification Wave | Boulder/Atlas tests | verification state | complete only after F tasks | verified-contract |
| PAR-STATE-001 | Todo single Session snapshot | DSH todo/write | projection only | not project authority | verified-contract |
| PAR-STATE-002 | Session Log replay/audit | DSH session | OMO events | crash recovery | verified-contract |
| PAR-STATE-003 | Boulder project authority | Core | file/repository | cross Session/worktree | verified-contract |
| PAR-GOAL-001 | persistent goal aid | DSH goal | auxiliary status | resume rearm explicit | not-started |
| PAR-RULE-001 | rules discovery/security | rules-engine | context resolver | precedence/path traversal | not-started |
| PAR-AGENTSMD-001 | hierarchical AGENTS | agents-md-core | native-aware adapter | no duplicate injection | not-started |
| PAR-SKILL-001 | skill discovery/precedence/filter | skills-loader-core | DSH Skill Registry | collision/disabled/agent scope | not-started |
| PAR-HASH-001 | read annotation + stale edit | hashline-core | tool enhancer/guard | stale/ambiguous fail | not-started |
| PAR-COMMENT-001 | comment checker all edit paths | core/hook tests | post-execute/final gate | apply patch/lazy init | not-started |
| PAR-MEM-001 | durable memory | memory-core | Host service | scope/delete/privacy | not-started |
| PAR-TEAM-001 | teams/tasks/mailboxes/worktree | team-core | Host + child backend | no dual authority | not-started |
| PAR-OPENCLAW-001 | gateway/hooks/replies | openclaw-core/schema | optional Host integration | credential/outage/malicious input | not-started |
| PAR-MON-001 | monitor lifecycle/tools/status | monitor source/tests | Host observer + projection | no authority mutation | not-started |
| PAR-UI-001 | current agent/work/status | OMO UI behavior | DSH projections/Slots | cold replay/current state | not-started |
| PAR-REL-001 | config migration | config schemas | dry-run migrator | unknown fields/idempotency | not-started |
| PAR-REL-002 | package/release gates | scripts/workflows | pack/SBOM/compat | final manifest verified | not-started |

## 3. 20 Core 的处置

| Core | 目标处置 | 验收要点 |
|---|---|---|
| `utils` | 直接复用 | 无 harness import |
| `model-core` | 复用算法，DSH model registry adapter | availability/capability/fallback fixtures |
| `prompts-core` | 直接复用 loader/variant；新增 DSH variants | prompt manifest |
| `boulder-state` | 直接复用 | exact parser/storage/replay |
| `delegate-core` | 复用 retry/model selection algorithm | DSH child lifecycle adapter |
| `omo-config-core` | 复用 schema/loader，Host-only Node dependencies | DSH overlay validator |
| `rules-engine` | 直接复用 | security boundary |
| `agents-md-core` | 复用匹配，避免 DSH native duplicate | nested fixture |
| `comment-checker-core` | 直接复用 | write/edit/apply paths |
| `hashline-core` | 直接复用 | stale validation |
| `memory-core` | 复用 domain，适配 storage/tools | scope/delete/locks |
| `team-core` | 复用 domain，适配 child/worktree/tool | mailbox/task authority |
| `skills-loader-core` | 复用 discovery/filter，适配 DSH Registry | precedence/invocation |
| `mcp-client-core` | 仅保留 OMO Skill-MCP 语义；优先 DSH MCP | schema/lifecycle |
| `lsp-core` | 算法复用或 DSH native equivalent | result differential |
| `mcp-stdio-core` | 仅确有外部 stdio 需求时复用 | cancellation/cleanup |
| `tmux-core` | Team/特殊 terminal 可选；优先 DSH Terminal | no duplicate PTY authority |
| `claude-code-compat-core` | 按 config compatibility 需求 | hook fixture |
| `openclaw-core` | 复用 domain，Host adapter | network/credentials |
| `telemetry-core` | 评估 reuse；必须符合 DSH privacy/settings | opt-out/redaction |

## 4. Hook 三清单

### 4.1 公开 `disabled_hooks` 配置名（固定 SHA：56）

处置码：`N` DSH native-equivalent；`A` adapter；`E` OMO emulation；`C` compatibility-only；`I` integration/optional。最终每行还需绑定 test ID。

| Hook | 初始映射 | DSH 组件 |
|---|---:|---|
| todo-continuation-enforcer | A | Continuation Driver |
| session-notification | N/A | Session projection/notification |
| comment-checker | A | Post Tool + Final Gate |
| tool-output-truncator | N/A | spill/result pruner + OMO policy |
| question-label-truncator | A | question adapter |
| directory-agents-injector | N/A | native AGENTS + core matcher |
| directory-readme-injector | A | context resolver |
| empty-task-response-detector | A | task validator |
| think-mode | C/A | prompt/model variant |
| model-fallback | A | model router |
| anthropic-context-window-limit-recovery | C | provider-specific recovery |
| preemptive-compaction | N/A | DSH compaction policy |
| rules-injector | A | rules context |
| background-notification | N/A | Job/subagent settlement |
| auto-update-checker | I | package update service |
| codegraph-bootstrap | I | optional integration |
| ast-grep-sg-provision | I | tool provisioning |
| startup-toast | I | nested update UI toggle |
| keyword-detector | A | command/input transform |
| agent-usage-reminder | A | prompt/runtime reminder |
| non-interactive-env | N/A | shell adapter |
| interactive-bash-session | N/A | DSH Terminal |
| tool-pair-validator | A | tool post validator |
| monitor-status-injector | A | monitor context |
| goal | N/A | DSH Goal + OMO evaluator |
| category-skill-reminder | A | task router |
| compaction-context-injector | A | resume context |
| compaction-todo-preserver | N/A | log Todo + OMO snapshot |
| claude-code-hooks | C | Hook bridge |
| auto-slash-command | N/A | DSH Commands |
| edit-error-recovery | A | post tool recovery |
| json-error-recovery | A | tool argument recovery |
| delegate-task-retry | A | task runtime |
| prometheus-md-only | A | monotonic tool guard |
| sisyphus-junior-notepad | A | notepad_append |
| team-tool-gating | A | team policy |
| no-sisyphus-gpt | C | compatibility route guard |
| no-hephaestus-non-gpt | C | compatibility route guard |
| hephaestus-agents-md-injector | A | role context |
| start-work | A | command + role/Boulder |
| atlas | A | work/continuation/verification |
| unstable-agent-babysitter | A | task monitor |
| task-resume-info | A | child descriptor/context |
| stop-continuation-guard | A | durable stop |
| tasks-todowrite-disabler | A | role tool policy |
| runtime-fallback | A | request-error state machine |
| write-existing-file-guard | N/A | fs observation/tool guard |
| notepad-write-guard | A | append-only tool guard |
| bash-file-read-guard | A | shell policy |
| hashline-read-enhancer | A | hashline tool adapter |
| read-image-resizer | A/N | attachment/vision adapter |
| todo-description-override | A | OMO task semantics |
| webfetch-redirect-guard | A | web adapter |
| fsync-skip-warning | C/A | filesystem correctness warning |
| plan-format-validator | A | Plan Validator |
| legacy-plugin-toast | C | migration UI |

### 4.2 Constructed runtime slots

源码审计约 58 个 constructed slots。实现阶段由脚本解析五个 composer：

- `create-session-hooks.ts`
- `create-tool-guard-hooks.ts`
- `create-continuation-hooks.ts`
- `create-skill-hooks.ts`
- `create-transform-hooks.ts`

另含 core composer。必须输出 `constructed-hooks.lock.json`，对每个 slot 映射到公开配置或 exception。

### 4.3 内部/无条件/嵌套行为

必须显式列 exception：

- Team status/mailbox transforms：constructed，但不完全受 `disabled_hooks` 控制；
- context transform：无条件；
- `startup-toast`：auto-update 内嵌 toggle，不是独立 top-level runtime slot；
- 其他 composer 发现项以生成脚本为准。

Drift test：固定 public 56、constructed snapshot、exception set；任一变化要求人工更新 parity。

## 5. 关键有意偏差

| ID | DSH 设计 | 为什么是偏差 | 默认/开关 | 必需证据 |
|---|---|---|---|---|
| DEV-001 | Structured Plan-Compiler | 当前 OMO 不是此固定多模型 IR pipeline | 可选后逐步默认 | quality/eval 不低于 upstream |
| DEV-002 | Atlas 禁止业务文件直写 | current Atlas source 未硬禁所有 write/edit | `compat` 默认首发；`deny-business-files` opt-in，成熟后再评估默认 | parity + hardening A/B |
| DEV-003 | Junior maxDepth=0 strict mode | current Junior 允许 research delegation | compat allowlist 默认；strict opt-in | task corpus |
| DEV-004 | DSH AgentTeams backend | OMO team-core 是原 authority | optional backend，single authority | team differential |
| DEV-005 | DSH Goal 辅助 | OMO continuation 不等同通用 Goal driver | optional internal support | completion correctness |

## 6. 矩阵关闭报告模板

每个 release 生成：

```markdown
# Parity Conformance Report
- OMO SHA:
- DSH SHA:
- Adapter version:
- verified/total:
- native-equivalent:
- intentional deviations:
- blocked:
- hard-policy pass:
- false-success rate:
- model-family scores:
- open P2 exceptions:
- approvals:
```

GA 条件：没有 `not-started`、`implemented`（未验证）、`blocked` 的 in-scope 行；所有 deviation 获批并公开。
