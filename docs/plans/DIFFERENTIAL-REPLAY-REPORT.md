# Differential Replay Report（G4 黑盒双端回放）

日期：2026-08-17
执行环境：OMO `038ed0cbbefe2b40677b63867aeea0d16bc303e0`（OpenCode CLI
1.15.13 + omo-opencode 插件，npm/pnpm 安装 + bun 构建子集）+ opencode-go
`deepseek-v4-flash`；DSH 侧：`/tmp/omo-eval-ocg`（同模型，容器 harness）。
方法：`docs/plans/DIFFERENTIAL-REPLAY-PLAN.md` §4，机器证据经
`tools/differential/evidence.mjs` 规范化与比较。

## 1. 执行规模

- 17 场景双端回放全部执行（OMO 侧每场景 12-345s，全为真实模型会话）；
- OMO 侧会话从 opencode.db 提取（part 流：工具调用 + 回合 + todo 工具计数）；
- 机器比较 13 对可用（E2E-12/15/16/17 OMO 侧为纯文本响应——模型未调用
  任何工具即正确作答，标记为 text-only、不做机器比较）。

## 2. 逐场景结果

| 场景 | OMO 调用 | DSH 调用 | OMO 回合 | DSH 回合 | 机器判定 |
|---|---|---|---|---|---|
| E2E-01 | 4 | 18 | 14 | 19 | 序列+数量分歧 |
| E2E-02 | 22 | 29 | 71 | 30 | 序列+数量分歧 |
| E2E-03 | 28 | 56 | 95 | 34 | 序列+数量分歧 |
| E2E-04 | 31 | 37 | 109 | 27 | 序列+数量分歧 |
| E2E-05 | 21 | 37 | 70 | 20 | 序列+数量分歧 |
| E2E-06 | 2 | 11 | 11 | 12 | 序列+数量分歧 |
| E2E-07 | 6 | 10 | 24 | 11 | 序列分歧 |
| E2E-08 | 5 | 9 | 16 | 6 | 序列+数量分歧 |
| E2E-09 | 26 | 21 | 61 | 9 | 序列+数量分歧 |
| E2E-10 | 18 | 2 | 59 | 3 | 序列+数量分歧（产品面差异，见 §4） |
| E2E-11 | 4 | 5 | 16 | 5 | 仅序列分歧 |
| E2E-13 | 8 | 10 | 27 | 9 | 仅序列分歧 |
| E2E-14 | 12 | 2 | 50 | 3 | 序列+数量分歧 |

## 3. 方法学修正（回放过程中发现并修正）

1. **工具名等价表**：两套产品工具词汇不同（OMO `write/todowrite/question`
   ↔ DSH `write/todo_write/ask_user_question`）。machine-exact 规则先经
   `OMO_DSH_TOOL_EQUIVALENCE`（compare-batch.mjs，文档化映射表）归一化；
   未映射的 OMO 工具名大声打破而非静默丢弃。
2. **todo 计数派生**：OMO part 流无 todo 事件面，todo 写入从 todo_write
   工具调用派生（与 DSH 的 todo/write 事件同语义）。
3. **角色序列跳过**：OMO part 流不含角色事件（/start-work 是文本命令），
   两侧任一为空时该项不比较（无数据 ≠ 不匹配）。

## 4. 漂移分类（plan §5）

- **无适配器合同破坏**：13 对可用比较中，没有一例显示 DSH 侧缺少 OMO 侧
  结构性完成任务的必要能力；两端转录均显示任务推进/完成尝试。
- **model-variance（数量/顺序分歧）**：绝大多数序列分歧源于同一模型在
  不同产品面下的探索深度差异（如 E2E-01 两侧都搜索并报告文件缺失，
  DSH 侧多探索了 str_replace_editor 路径）。
- **surface-difference（产品面差异）**：E2E-10（"记录当前角色"）DSH 侧
  直接调 `omo_role_status`×2（专用工具），OMO 侧无该工具故以 bash 探索
  代替——提示词为 DSH 定制面，差异按设计预期。
- **text-only**：E2E-12/15/16/17 OMO 侧零工具调用即完成（外部服务/团队/
  超规划/工具列表提示词本可文本作答），不构成比较失败。

## 5. 结论（诚实）

- **黑盒双端回放已执行**（G4 的"未执行"状态解除）：环境构建、17 场景
  双端执行、机器证据规范化、比较引擎、漂移分类全链完成；
- **机器精确对等不适用于跨产品比较**：工具词汇/事件面不同，machine-exact
  的等价性只能经文档化等价表达成，剩余序列/数量分歧经分类为
  model-variance 与 surface-difference，均非适配器合同破坏；
- **合同级对等由 live 证据套件承载**：角色切换、守卫拒执、/start-work
  交接、P2 结算、P4 终端、G8 镜像、G9 续跑等 25 项 G1-EVIDENCE 是 GA
  判定的权威面；本回放证明"不同产品面下行为可达"而非逐调用一致。
- 后续：DSH 上游工具面稳定后可收紧等价表并复跑；本报告不宣称
  machine-exact parity。

## 附：G11 client 集成实证（2026-08-17）

- client 角色徽章插件（`agent-presets/omo/client/omo-client-role-badge.mjs`，
  Slot 合同 live 验证：conversation.composer.dock）已入库；
- 测试镜像 file-backed dsh.client 行实证：host 树加载成功（web boot 无错误），
  但 `client-modules` 只为**包条目**（exports["./client"]）构图并服务
  `/plugins/<id>/client.js`——file 行 404、不进浏览器 roster；
- 结论：正确集成需在 DSH workspace 增加 client 包 + 进 client 构建图，
  超出测试镜像快照范围（不改 DSH checkout 的约束）；插件成品与合同已就绪，
  部署级集成待 DSH 侧提供 client 包位或由宿主部署的插件机制承载。
