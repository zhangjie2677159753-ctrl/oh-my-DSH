# DSH-in-Docker 受控测试环境

目标：在不接触正在运行的 DSH（`127.0.0.1:3080`）的前提下，用本地
deepseek-harness checkout 构建一个全新 DSH，在容器内验证 omo-dsh 的
mount/lifecycle（`G1-DEPLOYMENT-CHECKLIST.md`）。

## 边界（重要）

- checkout 只作只读 build context；不修改 checkout；
- 容器内是全新 `DSH_HOME`，**不复制宿主 credentials/settings/sessions**；
- checkout 中存在的本地未提交改动会进入测试镜像——这是测试环境，
  不构成对上游 SHA 的声明；
- 不复制模型密钥：G1 mount/lifecycle 验证先做 boot + preset 挂载 + 资源
  计数；需要真实模型调用的步骤必须由 owner 在授权环境另行执行。

## 用法

```bash
deploy/dsh-test-container/build.sh     # 构建镜像（首次约数分钟，走代理）
deploy/dsh-test-container/run-web.sh   # 容器内启动 web profile，宿主机 3090
```

## 验证顺序（对应 G1 检查单）

1. build 成功、`dsh web` 在容器内健康启动；
2. 日志确认 OMO preset 被 roster 发现且挂载无错误；
3. mount/unmount、资源计数由 headless/API 步骤逐步补齐（后续轮次）。

## 评测吞吐观察（2026-08-16，NIM openai/gpt-oss-120b）

- 每场景上限 1500s；实测每场景仅 2-4 次工具调用、2-4 个助手回合即超时
  （单回合 ~5-8 分钟）。E2E-01/02/03 均超时，行为目标（如 E2E-03 规划流、
  E2E-04 /start-work 交接）多数未达。
- 定位：模型端延迟为评测变量（`score-eval` 诚实边界已声明），不作为
  OMO 适配器缺陷；但深行为场景（角色切换/委派/交接）的证据主要来自
  定向探针（`G1-EVIDENCE.md` 12/13 条），而非 17 场景全量。
- 候选模型已排查：deepseek-v4-flash-0731 工具回合挂起、mistral-small-4
  410、kimi-k2.6 404、llama-3.3-70b 误路由 skill 工具——当前唯一可用
  tool-calling 模型即 gpt-oss-120b。
- 若 owner 提供更快的 tool-calling 模型路由，可重跑场景获得更厚的行为
  证据（harness 已就绪，改 `DSH_TEST_MODEL` 即可）。

## 行为证据进展（2026-08-16 21:40 更新）

- E2E-04（规划流 + /start-work 交接）：模型 live 切到 prometheus
  （reason="Switch to Prometheus to perform planning..."），8 次工具调用含
  `omo_role`/`glob`/`read`/`ask_user_question`（规划访谈语义的 DSH 原生工具），
  8 个助手回合后超时——**规划角色切换达成，交接未达**（1500s 上限）。
- E2E-05：0 次工具调用，`pi-ai stream idle timeout after 300000ms`
  （模型流空闲超时，未产出任何回合）。
- 模式：角色切换类行为在 ~25 分钟内可达；多步工作流（规划→交接→执行）
  受吞吐限制无法在单场景内闭环。E22 live 检查单中依赖插件重建的项
  仍待评测后执行。

## 子代理探针（2026-08-16 21:50）

- bash-39：要求模型委派 subagent 列出文件——模型选择直接 `glob`（1 次调用）
  未触发 `subagent/start`。subagent/end 事件形状仍未经 live 观察；插件结算
  处理器保持容错吞错设计，形状核实与 P2 注入绑定留待评测后镜像重建轮。
