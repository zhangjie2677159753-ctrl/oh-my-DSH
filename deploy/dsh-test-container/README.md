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

## 子代理探针二次结果（2026-08-16 22:30）

- bash-40：模型按要求调用 `subagent` 工具（launch 成功）→ 父会话日志出现
  `subagent/descriptor` 事件：`{version:2, mode:"one-shot", provider:"spawn",
  label:"list workspace files"}`；随后 llm/retry ×2 + 900s 超时被 kill，
  `subagent/start`/`subagent/end` 未在父日志切片中出现（可能属 child 会话
  日志或未及持久化）。descriptor 为父侧唯一已确认的 launch 标记。
- 对 P2 绑定的影响：插件 `subagent/end` 订阅形状仍待核实；当前处理器容错
  吞错，不阻断子代理生命周期。核实路径见 DRILL-RUNBOOK 重建序列第 4 步。

## E2E-08/09 与 RC 验证（2026-08-16 22:45）

- E2E-08（子代理委派）：模型调 web_search 1 次 + 再次发出
  `subagent/descriptor`（Tiny research 委派尝试）后超时——launch 路径两次
  live 确认，settlement 仍未在窗口内观察（源核实形状已修正绑定）。
- E2E-09（2000 词长文）：0 调用 1 回合超时。
- RC tag `omo-dsh-test-rc2` 验证通过（G1-EVIDENCE 第 16 条）；主 tag 切换
  待评测结算。

## OpenCode GO 模型路由（2026-08-16 23:00，用户授权方向）

- 容器内 `opencode-go`（pi-ai 内建目录 provider，api/baseURL 由目录填充）+
  `deepseek-v4-flash`：settings 仅声明 apiKeyEnv + 模型表；key 经
  `/tmp/omo-ocg-env`（0600，来自宿主凭据存储，全程不回显）注入
  `docker --env-file`。
- 冒烟探针（bash-44）一次通过：`omo_role(prometheus)` → 角色事件；
  `bash echo hi` → `Error: omo role prometheus denies bash`；全程数分钟内
  完成（无 1500s 超时）。
- 完整 17 场景评测启动：`run-eval-opencode.sh`（EVAL_OUT=/tmp/omo-eval-ocg，
  bash-45）；E2E-01 于 2 分钟内完成——与 NIM gpt-oss-120b（每场景 25 分钟
  且多超时）形成第二个模型族数据点（modelEvalMatrix 用途）。
- 与 NIM 评测（bash-36，/tmp/omo-eval）并行，互不干扰。

## OpenCode GO 首场景对比（2026-08-16 23:07）

- E2E-01（单文件 bug 修复）opencode-go/deepseek-v4-flash：**107s、18 次工具
  调用、19 回合、2990 字符完整转录**（read/glob/bash/str_replace_editor/grep/
  ask_user_question 全链路，模型完成修复讨论）。
- 同场景 NIM gpt-oss-120b：1500s 超时、4 次调用、无完成。
- 行为证据质量发生质变：17 场景预期 30-60 分钟全部完成（vs NIM 6+ 小时且
  多数超时）。
