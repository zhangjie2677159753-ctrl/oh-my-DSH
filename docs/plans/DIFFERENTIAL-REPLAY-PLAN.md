# Differential Replay Plan（G4 黑盒双端回放设计）

目标：把"与上游的 differential 回放仅合同级"推进到可执行的黑盒双端回放。
本文件是执行设计 + 就绪度声明；未宣称已执行。前提缺口：OMO 侧需要可运行的
OpenCode（fixed SHA）环境（OpenCode CLI + OMO 插件装载）；DSH 侧已具备
（容器评测 harness）。

## 1. 双端

| 端 | 运行方式 | 证据格式 |
|---|---|---|
| A（OMO） | OpenCode CLI @`038ed0c…` + OMO plugin，NIM `openai/gpt-oss-120b`（OpenAI 兼容 provider） | OpenCode session log（event stream）→ 规范化 |
| B（DSH） | 容器 `omo-dsh-test` headless + omo preset，同模型同 provider | `session.jsonl`（已具备，`run-eval.sh`） |

模型必须同端同型：任何文本差异不得被"模型不同"解释掉。

## 2. 场景来源与规模

- 17 E2E（`eval-corpus.json` e2e）+ 10 behavioral（behavioralScore）；
- 每场景三要素：初始工作区 fixture（同 SHA 仓库/文件集）、首条用户消息、
  expected machine-observable sequence（人工冻结，作为比较基线而非唯一真值）。

## 3. 规范化证据 Schema（两端统一投影）

```json
{
  "scenario": "E2E-01",
  "side": "omo|dsh",
  "toolCalls": [{"name": "read", "argsDigest": "sha256", "order": 1}],
  "roleEvents": [{"role": "prometheus", "revision": 1, "order": 3}],
  "boulderWrites": [{"work": "w1", "agent": "sisyphus"}],
  "todoWrites": [{"items": 1}],
  "continuationDecisions": [{"kind": "continue|stop", "atTurn": 4}],
  "assistantTurnCount": 8,
  "finalWorkState": "completed|partial|timeout"
}
```

工具 args 只存 digest（不泄漏敏感输入）；文本转录单独保存，不参与机器比较。

## 4. 比较规则

| 类 | 规则 |
|---|---|
| machine-exact | 工具名序列、role 切换顺序、Boulder/todo 写入事实、续跑决策 kind：逐项精确比对；任一项不一致 = parity-break |
| semantic-tolerant | 工具调用**次数**（模型自由裁量）、args 细节（digest 不同允许，但工具名一致） |
| model-variance | assistant 文本、reasoning 内容：记录不比较，单独审计是否隐藏行为差异 |
| documented-deviation | 预先登记的差异清单（如 auto-slash 模型侧不展开、background-notification 结算级收缩）：命中即通过并计数，未登记差异 = fail |

## 5. 漂移分类与处置

1. `parity-break`（P0）：机器序列不一致且未登记 → 开缺陷，GA 阻断；
2. `semantic-equivalent`：映射面不同但行为等价 → 记录进 parity.json deviation；
3. `model-variance`：排除出比较，附审计结论；
4. `documented-deviation`：计数并复核清单仍然有效。

## 6. 退出判据

- 27 场景全部产出双端规范化证据；
- machine-exact 类 100% 一致（或全部命中 documented-deviation）；
- 每个 parity-break 有 root-cause 与修复 commit；
- 报告落 `docs/plans/DIFFERENTIAL-REPLAY-REPORT.md`（执行后生成）。

## 7. 就绪度

- DSH 端 runner：**已就绪**（`run-eval.sh`/`parse-evidence.mjs`，机器证据 + 转录已跑通）；
- 证据 schema 投影：**已实现**（`tools/differential/evidence.mjs`：共享 schema +
  DSH 规范化器（真实 session.jsonl 格式）+ OMO 规范化器（声明式输入合同，
  见模块内 `OMO_LOG_INPUT_CONTRACT`，执行前需对照真实 OpenCode 导出核对）+
  比较引擎（machine-exact/semantic-tolerant/documented-deviation 三类规则）；
  9 项测试并入 g1-preflight 第 12 项）；
- OMO 端：**阻塞**——需可运行 OpenCode fixed-SHA 环境（owner 提供或批准构建）。
