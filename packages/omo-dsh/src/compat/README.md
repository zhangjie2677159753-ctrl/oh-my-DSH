# `src/compat/` — DSH SPI 隔离面

本目录是 omo-dsh 对 DeepSeek Harness 全部 API 访问的唯一入口（见
`docs/architecture/TARGET-ARCHITECTURE.md` §15）：

- `dsh-api.ts`：DSH import、Cordis event/Service 名、Session event 解码、Prompt 注册、
  tool waterfall、route/request header 翻译、agent stop/steer、preset lookup、
  subagent/job handle、goal/todo event shape、Remote/Typert、Slot/projection、bundle/profile 加载。
- `capabilities.ts`：optional Service capability probes；不支持必须在启动前 fail loud。
- 历史读取与 live subscription 分离，seq 去重。
- unknown required Session event fail closed；`ignorable: true` 才可跳过。
- 升级 DSH SHA 前必须重跑 `docs/plans/compat-contracts.json` 的 35 项合同套件。

阶段 A 只放 DTO/stub，不放任何 OMO 复制源码（License Gate 见 `docs/legal/USAGE-DECISION.md`）。
