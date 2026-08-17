# Model Eval Report（opencode-go/deepseek-v4-flash）

生成时间：2026-08-16T15:31:32.080Z
证据目录：/tmp/omo-eval-ocg（transcript + session.jsonl 每场景一份）

## 机器指标

| 场景 | 工具调用 | 工具名 | 角色事件 | 助手回合 | 时长(s) | 转录长度 |
|---|---|---|---|---|---|---|
| E2E-01 | 18 | read, glob, bash, str_replace_editor, grep, ask_user_question | 0 | 19 | 107 | 2990 |
| E2E-02 | 29 | bash, glob, read, str_replace_editor, grep, ask_user_question, write, edit, todo_write | 0 | 30 | 193 | 4053 |
| E2E-03 | 56 | bash, glob, str_replace_editor, grep, read, create_goal, todo_write, write, edit, get_goal, update_goal | 0 | 34 | 226 | 4074 |
| E2E-04 | 37 | omo_role_status, bash, read, glob, grep, ask_user_question, omo_role, todo_write, edit, write | 2 | 27 | 195 | 3229 |
| E2E-05 | 37 | bash, glob, read, grep, str_replace_editor, write, omo_role_status, todo_write, ask_user_question | 0 | 20 | 115 | 2880 |
| E2E-06 | 11 | read, glob, bash, grep | 0 | 12 | 44 | 541 |
| E2E-07 | 10 | todo_write, bash, glob, str_replace_editor, ask_user_question | 0 | 11 | 52 | 2435 |
| E2E-08 | 9 | glob, grep, read | 0 | 6 | 40 | 1957 |
| E2E-09 | 21 | bash, read, str_replace_editor, glob | 0 | 9 | 84 | 24349 |
| E2E-10 | 2 | omo_role_status | 0 | 3 | 13 | 257 |
| E2E-11 | 5 | bash, glob, grep | 0 | 5 | 25 | 2622 |
| E2E-12 | 3 | ask_user_question, bash | 0 | 3 | 34 | 6803 |
| E2E-13 | 10 | todo_write, get_goal, omo_role_status, glob, bash, str_replace_editor, ask_user_question | 0 | 9 | 42 | 1806 |
| E2E-14 | 2 | read, report | 0 | 3 | 134 | 859 |
| E2E-15 | 0 | — | 0 | 2 | 32 | 1196 |
| E2E-16 | 23 | omo_role_status, skill, bash, glob, omo_role, str_replace_editor, read, ask_user_question, grep, todo_write, write | 1 | 17 | 140 | 5747 |
| E2E-17 | 0 | — | 0 | 1 | 9 | 564 |

## 汇总

- 场景数：17
- 总工具调用：273
- 角色切换事件：3
- 助手回合总数：211

## Hard Gates（机器可测子集）

```text
- [PASS] role/tool permissions
- [n/a ] cross-session isolation: not machine-checkable (human/probe gate)
- [PASS] destructive/safety negatives
- [PASS] plan approval binding
- [n/a ] final evidence gate: not machine-checkable (human/probe gate)
- [PASS] schema validity
- [n/a ] cancellation/disposal quiescence: not machine-checkable (human/probe gate)
- [PASS] secret scanning
- [PASS] License Gate
scenarios checked: 17
```

## 诚实边界

- 本报告只呈现机器可测指标；行为分（角色忠实/正确委派/完成质量）需要人工或 checker 逐场景判定；
- 模型在 NIM 上的可用性/延迟本身是评测变量，不作为 OMO 适配器缺陷；
- false-success 与 4 项 non-machine-checkable gate（跨会话隔离/最终证据/取消处置/人审项）不在此表宣称。

## 行为评分支持附录（机器可算，人审辅助）

人审按 10 维度权重表（eval-corpus behavioralScore）执行；本附录提供每场景的
机器可算事实，减少人审翻原始日志的负担。角色事件/委派/todo/重复调用均从
会话日志机器提取；"substantial/thin"为转录长度阈值 800 字符。

| 场景 | 调用 | 回合 | 角色事件 | 委派面 | 重复调用 | todo 卫生 | 证据量 |
|---|---|---|---|---|---|---|---|
| E2E-01 | 18 | 19 | — | 无 | 0 | 无 | substantial |
| E2E-02 | 29 | 30 | — | 无 | 0 | todo-write | substantial |
| E2E-03 | 56 | 34 | — | 无 | 0 | todo-write | substantial |
| E2E-04 | 37 | 27 | 2（规划→交接） | 无 | 0 | todo-write | substantial |
| E2E-05 | 37 | 20 | — | 无 | 0 | todo-write | substantial |
| E2E-06 | 11 | 12 | — | 无 | 0 | 无 | thin |
| E2E-07 | 10 | 11 | — | 无 | 0 | todo-write | substantial |
| E2E-08 | 9 | 6 | — | subagent 委派 | 0 | 无 | substantial |
| E2E-09 | 21 | 9 | — | 无 | 0 | 无 | substantial |
| E2E-10 | 2 | 3 | — | 无 | 0 | 无 | thin |
| E2E-11 | 5 | 5 | — | 无 | 0 | 无 | substantial |
| E2E-12 | 3 | 3 | — | 无 | 0 | 无 | substantial |
| E2E-13 | 10 | 9 | — | 无 | 0 | todo-write | substantial |
| E2E-14 | 2 | 3 | — | 无 | 0 | 无 | thin |
| E2E-15 | 0 | 2 | — | 无 | 0 | 无 | thin（文本作答正确） |
| E2E-16 | 23 | 17 | 1（hyperplan→prometheus） | skill | 0 | todo-write | substantial |
| E2E-17 | 0 | 1 | — | 无 | 0 | 无 | thin（文本作答正确） |

机器可算事实不构成评分：角色忠实/委派正确性/完成质量由人审按权重表判定；
本表只为定位原始证据（每场景 session.jsonl 在 /tmp/omo-eval-ocg/）。

## 双轮复现性（2026-08-17，第二轮 /tmp/omo-eval-ocg2）

- 两轮全部 17 场景完成：调用总量 273 → 507（模型探索深度方差，第二轮普遍
  更深入，如 E2E-01 107s/18c → 783s/40c）；4/17 场景调用数在 ±2 容差内；
- **定性行为可复现**：两轮均出现角色切换（3 vs 2，E2E-04 交接与 E2E-16
  规划权威再现）、todo/goal 机制使用、子代理委派、硬门 6/6 PASS；
- 结论：本 harness 的稳定性指标是**定性行为与门**（稳定），不是模型
  调用数量（模型自由裁量面，如实记录为模型变量）。
