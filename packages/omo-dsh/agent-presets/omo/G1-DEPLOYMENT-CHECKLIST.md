# G1 真实 DSH 部署 Mount 检查单

`tools/g1-preflight.mjs` 通过后，才允许在目标 DSH 部署执行以下步骤。
staging 仓库不 boot DSH；本清单在 omo-dsh 集成进部署时逐项执行并记录证据。

## 前置

- [ ] `node tools/g1-preflight.mjs` → PASSED（记录输出）
- [ ] DSH 部署 SHA = `47f943859bef60e4160492346772ded9b24f765a`（或已跑通 compat 合同的新 SHA）
- [ ] 使用 owner 自建的 preset 副本（`~/.dsh/.agent-presets/omo/`），**不修改 shipped preset**
- [ ] 不在运行中的主 Profile 上实验；使用独立/测试组合

## Mount 与生命周期证据

1. [ ] mount preset：无 process-global Service 拒绝，无跨 Session 冲突告警
2. [ ] 创建 Session A/B：A 写入 `omo/role=atlas` 并 flush；B 保持默认 sisyphus（无泄漏）
3. [ ] 启动一个 Explore child（continuable），记录 durable child Session ID
4. [ ] child 独立：child 不能修改 parent 角色；parent stop 不删除 child
5. [ ] stop：listener/timer/child/job 计数归零（记录前后计数）
6. [ ] resume：从 Session Log fold 恢复角色，不依赖进程内存
7. [ ] unmount：mount/unmount 资源计数相等；无残留 job/timer/listener

## 必须失败的行为

- [ ] 未知 required Session event → 拒绝重建
- [ ] continuable + outputSchema → launch 前拒绝
- [ ] 把 process-local Job ID 当 durable task ID → 拒绝
- [ ] 工具 schema 含 `type: "json"|"text"` → lint/启动拦截

## 证据格式

每项记录：命令、exit code、关键输出、Session ID、前后资源计数、时间戳。
全部通过才算 G1；任一失败回到 staging 修复并重跑 preflight。
