# E29/E31 真机演练 Runbook（准备态，未执行）

本文件是 G12（迁移/回滚仅 dry-run 与状态机）的真机演练执行手册。纯逻辑层
（`config-mapper.mjs` / `state-migrator.mjs` / `rollback.mjs`）已有测试覆盖；
此处定义容器内 live drill 的步骤、判据与证据落点。执行一次勾一项，证据
回填 `G1-EVIDENCE.md` 与 `parity.json`（G12 行）。**任何一步失败都不得
跳过——drill 的目的就是让失败可见。**

## 前提

- `omo-dsh-test` 镜像已按固定 SHA 构建（`build.sh`）；
- 一个合成的 OMO 用户 home（`prepare-home.sh` 产物或手工 fixture）；
- 每步用全新 `DSH_HOME`（`--user $(id -u):$(id -g)`、`--network=host`）；
- key 只经 `--env-file` 注入，drill 期间不落盘、不进 git。

## E29 迁移演练（drill-migration.sh）

| # | 步骤 | 判据 | 证据 |
|---|---|---|---|
| M1 | 合成 OMO config（含 team_mode/memory/monitor/openclaw/telemetry + 2 个未映射键 + 1 个 secret 形值） | mapper 输出 mapping 报告：5 键映射、2 键 unmapped 报告、secret 变成 credential 引用 | `drill-out/m1-report.json` |
| M2 | 同一 config 跑两次 dry-run | 两次输出 digest 一致（幂等） | `drill-out/m2-digest.txt` |
| M3 | 状态迁移：v1 状态 → v2（currentVersion） | 逐 migration 应用、版本号推进、失败 migration 回滚 | `drill-out/m3-state.json` |
| M4 | 降级：v2 → 只读反向迁移 | 只读、生成 downgrade 报告、不写回 v2 文件 | `drill-out/m4-downgrade.json` |
| M5 | active child/work 存在时启动迁移 | 拒绝或排队（按实现），绝不静默丢活 | `drill-out/m5-guard.json` |

## E31 回滚演练（drill-rollback.sh）

| # | 步骤 | 判据 | 证据 |
|---|---|---|---|
| R1 | 注入触发事件序列（如 false-success 信号 / kill-switch） | `assessRollbackTrigger` 触发，等级与原因正确 | `drill-out/r1-trigger.json` |
| R2 | 执行 rollback runner（ROLLBACK_STEPS 顺序） | 每步先停后删（停子代理→删镜像→切回旧 preset），步骤间失败即中止 | `drill-out/r2-run.json` |
| R3 | 中途注入一步失败 | runner 停在失败步，已完成步骤不重放（幂等重入） | `drill-out/r3-abort.json` |
| R4 | 重跑 runner | 从失败步继续，最终收敛 | `drill-out/r4-resume.json` |
| R5 | 回滚后残余资源检查 | 无遗留 child/终端/镜像引用；`reconstructTimeline` 与事实一致 | `drill-out/r5-clean.json` |

## G13 干净消费者演练（已执行）

`drill-consumer.sh`（无模型调用）：载荷 digest 门 → 全新 DSH_HOME discovery →
插件模块加载。2026-08-16 通过：`{"id":"omo","broken":false}` +
`{name:"omo-role",inject:["tools","systemPrompt"],hasApply:true}`；
证据 `/tmp/omo-drill/consumer-*.jsonl`，结论入 G1-EVIDENCE 第 15 条。

## 证据纪律

- 所有 drill 输出放 `/tmp/omo-drill/`（不进仓库）；结论与文件摘录进
  `G1-EVIDENCE.md` 第 14/15 条并更新 parity.json G12 行 `liveEvidence`；
- drill 使用合成 fixture，不触碰真实用户 home 与运行中的宿主 DSH（3080）；
- 完成后 `docker ps` 无 drill 残留实例。

## 评测结算后的镜像重建与 E22 live 验证（round 37 预制）

前置：`run-eval.sh`（bash-36）完全结算；先应用 `run-eval.sh.fix.patch`。

1. **重建镜像**（含新插件：动态段 + 结算审计）：
   ```bash
   deploy/dsh-test-container/build.sh          # 重烤 omo-plugin 树（roles/dynamic-sections + children/notification）
   ```
2. **构建自检**（无模型）：`drill-consumer.sh` 全绿（discovery + 插件加载）。
3. **G6' 动态段 live**：模型探针 "Call omo_role role=prometheus reason=g6. Then call omo_role_status. Then stop."
   → 会话日志出现 omo/role 事件且无插件错误；段注册经容器内 exec 探针
   （`ctx.systemPrompt` 段清单含 omo:current-role/omo:guard-status/omo:work）。
4. **P2 结算绑定**：若 bash-40 探针给出 subagent/end 形状 → 按形状修正插件
   handler → 子代理探针复跑 → 父会话出现 `omo/notification` 事件。
5. **E22 Live Evidence 表回填**：每项勾选 + 证据路径/seq 引用；
   parity 行 liveEvidence 同步。
6. **收尾**：`finish-eval.sh /tmp/omo-eval --commit`（重建 summary → 状态视图 →
   MODEL-EVAL-REPORT.md 含硬门块）。
