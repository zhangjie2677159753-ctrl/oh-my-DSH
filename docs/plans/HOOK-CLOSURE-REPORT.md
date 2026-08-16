# E22 Hook 闭包报告（固定 SHA）

数据源：`docs/plans/hook-inventory.lock.json`（56 configurable / 58 constructed / 4 exceptions）
+ `docs/plans/hook-closure-status.json`（生成器：`tools/generate-hook-closure.mjs`）。

## 状态总账

| 状态 | 数量 | 含义 |
|---|---|---|
| contract-level | 41 | 纯逻辑模块 + `node --test` 覆盖；DSH 运行时绑定待接入 |
| native-equivalent | 5 | DSH 原生机制等价（需在 session 级验证中补等价证明） |
| compat-only | 6 | 仅当兼容目标（OpenCode/Claude/Anthropic）实际启用时需要 |
| out-of-scope-batch-a | 3 | 发布/更新类工具，Batch A 明确排除，GA 前决策 |
| nested-toggle | 1 | 非独立 runtime slot（auto-update 内嵌） |

pending-binding 与 unassigned 均为 0。

## compat-only 六项（逐项决策）

| Hook | 启用条件 | 决策 |
|---|---|---|
| anthropic-context-window-limit-recovery | Anthropic provider | provider adapter 实现时再做；capability probe 先行 |
| claude-code-hooks | Claude Code 兼容目标 | `claude-code-compat-core` 决策后绑定 |
| no-sisyphus-gpt / no-hephaestus-non-gpt | 上游历史模型路由约束 | 由 model-binding 的 route guard 配置表达，不单独注册 |
| fsync-skip-warning | 宿主 fsync 行为 | 与 boulder 仓储绑定一并落地（警告级） |
| legacy-plugin-toast | 旧插件迁移提示 | 迁移 UI 阶段实现 |

## native-equivalent 五项（等价证明要求）

preemptive-compaction（DSH compaction policy）、background-notification（Job/subagent settlement）、
non-interactive-env（shell adapter）、interactive-bash-session（DSH Terminal）、
auto-slash-command（DSH Commands）。等价证明主体已落
`docs/plans/NATIVE-EQUIVALENCE-PROOFS.md`（上游行为+DSH 原生机制逐条行号引用、
映射表、compat 补丁与 live 检查单）；每项还需在 session 级容器验证中记录
"上游行为 → DSH 原生行为"的等价观察并回填该文件的 Live Evidence 块，
未完成前 GA 门不放行。

## 例外项（constructed 面）

- team-mode-status-injector / team-mailbox-injector：绕过 disabled_hooks（team_mode.enabled 门）；
- context-injector-messages-transform：无条件；
- startup-toast：auto-update 嵌套 toggle。
三者已入 `hook-inventory.lock.json` exceptions，drift test 覆盖。

## 更新纪律

上游 SHA 变化 → `tools/extract-hook-inventory.mjs` 重跑 → 清单 diff → 本报告与
closure JSON 人工复核；56/58/4 任一变化都 fail closed。
