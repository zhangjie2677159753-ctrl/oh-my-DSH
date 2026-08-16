# Boulder 仓储的 DSH 绑定 Spec（E14）

纯件（state/repository/plan-checklist）已测试；宿主绑定按下述进行。

## 文件仓储

- `createBoulderRepository({ fs })` 的 fs adapter 用宿主真实 `node:fs/promises`
  实现（readFile/writeFile/rename/unlink 同名）；
- 路径：`<project>/.omo/boulder.json`；写入前 `assertPathInsideRoot`（context/rules.mjs）；
- 原子写（temp+rename）与 digest CAS 已由纯件保证，宿主侧补充
  `fsync` 目录（或记录 fsync-skip-warning，对应 compat-only hook）。

## 与 Session 的权威关系

- Session Log 是会话内权威；Boulder 是跨会话/项目权威；
- `omo/role` 持久化限制（R16）下，Boulder 镜像 reconciliation 是跨重启回退：
  恢复顺序 = 先试 Session Log fold；DSH restore 拒绝时读 Boulder 镜像
  （`agent`、`agentReconciled` 字段）并记录 deviation；
- Todo 投影保持单会话视图（`projectNextTaskTodo`）。

## 宿主服务放置

- Boulder repository 是 Host-plane service（跨 Session 共享）；
- 不得在 Agent Preset 内发布（mount safety 会拒绝或产生跨会话冲突）；
- flush 检查点：`checkpointPolicy('boulder/commit').flushRequired` 已为 true。

## 前置（缺一不接入）

- 宿主 fs 绑定单测 + 一次真实崩溃注入演练；
- R16 镜像回退的端到端恢复演练；
- worktree 路径所有权校验（Team 多写者）就绪。
