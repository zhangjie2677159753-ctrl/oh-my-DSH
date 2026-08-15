# DeepSeek 实施移交协议

## 1. 给执行 Agent 的不可变目标

> 在固定 OMO SHA `038ed0cbbefe2b40677b63867aeea0d16bc303e0` 与 DSH SHA `47f943859bef60e4160492346772ded9b24f765a` 上，按 `MASTER-IMPLEMENTATION-PLAN.md` 和 `PARITY-MATRIX.md` 实现 `packages/omo-dsh` 的完整行为对等迁移；不得把未验证部分描述为完成，不得以 Prompt 代替硬约束，不得在 License Gate 前复制受 SUL 限制的 Core/Prompt。

## 2. 开工前必读顺序

1. `README.md`
2. `docs/research/SOURCE-BASELINE.md`
3. `docs/architecture/TARGET-ARCHITECTURE.md`
4. `docs/plans/PARITY-MATRIX.md`
5. `docs/plans/MASTER-IMPLEMENTATION-PLAN.md`
6. `docs/plans/ACCEPTANCE-AND-EVALUATION.md`
7. 当前 OMO/DSH checkout 的相关 `AGENTS.md` 与 source/tests。

执行者要先复述：当前 Batch、入口 Gate、任务 IDs、预计文件、测试、风险；复述不一致则不得改代码。

## 3. 仓库与分支纪律

真正实现目标是 OMO Monorepo 中的 `packages/omo-dsh/`。如果只在 `oh-my-dsh` 规划仓库执行，第一步应创建/挂接一个合法工作副本或记录上游合入策略，不能把 adapter 假装已经在 OMO workspace。

分支建议：

```text
feat/omo-dsh-e00-baseline
feat/omo-dsh-e01-compat
feat/omo-dsh-e04-role-runtime
...
```

每个提交：

- 单一任务或紧密原子组；
- 一行摘要，例如 `feat(omo-dsh): add logged primary role fold`；
- 同提交含最小测试；
- 提交前 `git status`；
- 不提交 token、`.env`、node_modules、临时抓取、日志；
- 不改用户已有未提交文件；
- 不修改 shipped DSH preset；如需变化，创建 package-owned preset/overlay。

## 4. Secret 与 GitHub

- 永远不要把 token 写入 remote URL、脚本、文档、commit、shell history 或日志。
- 使用 `gh auth login`/credential helper/SSH 等安全认证；若环境没有安全认证，停止推送并报告本地 commit SHA。
- 聊天中出现过的 personal access token 视为已泄露，必须在 GitHub 撤销并新建最小权限 token。
- 推送前检查：

```bash
git remote -v
git log -p --all -- . ':!package-lock.json'
# 加 secret scanner
```

任何 secret finding 是 P0，停止发布并清理历史。

## 5. 执行循环

每个任务严格按：

```text
Claim task
→ Read exact current source/tests
→ Update parity row to verified-contract
→ List expected files
→ Implement smallest slice
→ Run focused tests
→ Run compat/domain gates
→ Inspect diff/status
→ Write evidence
→ Review negative/recovery cases
→ Commit
→ Update task/parity status
```

禁止：

- 一次实现多个未关联 Epic；
- 先写大量代码再补合同；
- 跳过 focused tests 只跑全量；
- 测试失败后删除/放宽测试；
- 为了兼容猜测 DSH API；
- 在 DSH checkout 有 unrelated local changes 时重置/覆盖它们；
- 通过更换 Prompt 文案绕过 runtime bug。

## 6. Batch A：唯一允许的第一批实现

### 6.1 范围

```text
OMO-0001..0005
OMO-0101..0103
OMO-0201..0206
OMO-0301..0302
```

### 6.2 具体交付

1. upstream lock + license decision；
2. parity machine schema；
3. package skeleton；
4. config/tool schema lint；
5. `compat/dsh-api` 最小 session/prompt/tool/route/subagent/todo；
6. `omo/role` 最小 event/fold；
7. Sisyphus + Explore vertical slice；
8. mount/two sessions/child/stop/resume/unmount integration；
9. 资源泄漏证明。

### 6.3 Batch A 停止条件

遇到任一情况必须停止并报告，不得绕过：

- License 未决定且任务需要复制 OMO source/prompt；
- DSH 实际 SHA 不匹配；
- preset mount 需要发布 process-global service；
- child provider 不支持所需 capability；
- Session event 无法被 invariant/replay；
- shipped preset 必须被修改才能继续；
- 工具 schema validation 不通过；
- unmount 后仍有 side effects。

## 7. 后续并行策略

只有 G1 通过后才并行：

### Lane R — Role/Prompt/Route

`E04 → E05 → E06 → E07 → E08`

### Lane T — Task/Child

`E09 → Explore → controls → other children → E11`

### Lane S — State/Plan

Plan schema/renderer 可先行；完整 Planning 等 Lane T；Boulder adapter 可独立；Atlas/Continuation 等 approval manifest。

### Lane C — Context/Guards

Rules/AGENTS/Skills/Hashline/Comment/Compaction，在 core runtime 稳定后。

### Lane I — Integrations/UI

Memory/Team/OpenClaw/Monitor/UI 最后，默认 feature off。

一个 Lane 的输出要被另一 Lane 使用时，先合并 DTO/schema 契约，不让两边复制类型。

## 8. 任务报告格式

每完成一个任务，在 PR/commit notes 写：

```markdown
## OMO-XXXX

### Contract
- OMO source:
- OMO tests:
- DSH source/API:
- Parity rows:

### Files
- ...

### Behavior
- ...

### Verification
- `command` → exit 0
- negative/replay/chaos cases

### Evidence
- artifact path/digest

### Deviations
- none / DEV-xxx

### Risks/Follow-ups
- ...
```

不允许“done”“tests pass”这类无证据报告。

## 9. Reviewer 清单

Reviewer 必须独立检查：

- source path 是否与固定 SHA 一致；
- 实现是 parity 还是 enhancement；
- DSH service plane 是否正确；
- Session event lossless JSON/invariant/replay；
- tool filter 同时影响可见性和执行；
- cancel/dispose/flush 区分；
- error/negative/recovery tests；
- schema vocabulary；
- no secrets/license notices；
- parity row 和 evidence 更新；
- stop/update 无泄漏。

Reviewer 不因测试多就忽略缺失的行为合同。

## 10. 模型 Prompt 工作专门协议

1. 先写 semantic contract tests；
2. 再写 model-neutral blocks；
3. 再写 DeepSeek/GPT/Qwen variants；
4. snapshot manifest；
5. keyless/fake tests；
6. live model eval；
7. 对比 token、latency、role fidelity、false complete；
8. 未达阈值回滚 variant，不改 hard guard。

不能仅凭一次“看起来不错”的对话批准 Prompt。

## 11. 完成声明规则

执行 Agent 只能在以下条件全部满足后说“完整 OMO for DSH 已完成”：

- parity matrix 所有 in-scope 行 `verified`；
- Hook 三清单全关闭且 drift test；
- 20 Core 每个有处置与测试；
- G0-G9 通过；
- hard gates 100%；
- model eval threshold；
- false-success <1%；
- migration/rollback/soak；
- License/security/privacy sign-off；
- final conformance report 获批；
- artifact 已发布/安装验证。

在此之前必须使用准确措辞：

- “Batch A 完成”；
- “Role runtime 已实现但未 live-model 验证”；
- “E04 已验证”；
- “存在 DEV-002 偏差”；
- “Blocked by ...”。

## 12. 外部阻塞报告

只有满足下列才可 blocked：

- 缺 credential/授权/硬件/第三方服务；
- License 决策未给；
- exact DSH capability 缺失且不能保持合同；
- 上游行为自相矛盾且 source/test 回放无法解决；
- 用户需要做不可代理的决定。

报告必须给：

```text
阻塞条件
影响任务 IDs
已经验证的证据
不能安全绕过的原因
用户/owner 需要做什么
解除后从哪个 checkpoint 恢复
```

“困难”“还要研究”“测试失败”不算外部阻塞。

## 13. 发布与回滚手册

### 发布前

- clean status；
- all gates；
- package pack contents allowlist；
- SBOM/notices；
- secret scan；
- compatibility manifest；
- migration dry-run/backup；
- canary feature flags；
- previous package/preset available。

### 回滚触发

Atlas bypass、data leak、false success、retry storm、orphan、migration loss、secret leak、fallback replay side effect、unmount leak。

### 回滚动作

1. integrations kill switch；
2. disable new OMO sessions；
3. settle/cancel children；
4. existing sessions export/read-only；
5. roll back package/preset；
6. restore state backup；
7. verify no residual resources；
8. reconstruct incident timeline；
9. add regression test before re-release。

## 14. 第一条给 DeepSeek 的启动指令

```text
只执行 Batch A。先读全部六份规划文档和固定 SHA 的相关源码，不写任何业务实现，先提交：
1) License Gate 所需问题和当前结论；
2) OMO/DSH lock manifests；
3) machine-readable parity schema；
4) packages/omo-dsh skeleton file plan；
5) compat/dsh-api 30+ contract test list；
6) vertical slice sequence diagram；
7) 预计提交序列。
经审查通过后，再从 OMO-0101 开始编码。不要修改 DSH shipped preset，不要复制 OMO Prompt/Core，不要使用聊天中出现过的 token。
```
