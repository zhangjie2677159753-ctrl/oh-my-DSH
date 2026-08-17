# G1 容器验证证据（第一轮 smoke）

日期：2026-08-15（会话内实际执行）
镜像：`omo-dsh-test:latest`（本地 deepseek-harness checkout HEAD 构建；
本地三个未提交改动在 snapshot 中被 HEAD 版本中和，见 build.sh）
DSH SHA：`47f943859bef60e4160492346772ded9b24f765a`

## 已通过

1. [x] 镜像构建：`pnpm install --frozen-lockfile` + `build:lib` + `build:web` 全绿。
2. [x] 全新 `DSH_HOME`（仅含 `omo` preset）下 `dsh web --port 3090` 启动：
   `dsh web: http://127.0.0.1:3090`，宿主机 `curl http://127.0.0.1:3090/` → `200`。
3. [x] 未触碰运行中的宿主 DSH（3080）。
4. [x] 容器内真实 discovery：
   ```text
   {"id":"omo","name":"OMO for DSH（Batch A staging）","broken":false}
   ```
   证明 roster 发现、结构校验通过、无 broken row。
5. [x] 容器停止/删除无残留（`docker rm -f omo-dsh-test-web` 后 `docker ps` 无该实例）。
6. [x] E04 角色插件集成（第二轮）：
   - preset 新增 file-backed 行 `name: ./omo-role-plugin.mjs`，discovery 仍 healthy；
   - 插件模块容器内加载成功：exports `name/inject/apply/Config`；
   - 裸导入通过 `omo-plugin/node_modules/@deepseek-ai/*` 真实 entry symlink 解决；
   - `omo_role`/`omo_role_status` 工具定义（append/fold `omo/role` session events）。
7. [x] 记录 R16：out-of-repo 事件可 live append，但 stock persistence restore 拒绝未标记
   ignorable 的未知类型且 append 无 ignorable 入口——Boulder 镜像 reconciliation
   作为回退，上游注册面是 P1 跟踪项（SOURCE-BASELINE §5.6、PARITY-MATRIX PAR-STATE-002）。
8. [x] E04 工具守卫接入（第三轮）：
   - 插件注册 `tools/pre-execute` waterfall 监听（`PreToolDecision` deny 形状按固定 SHA 源码）；
   - `guard-decision.mjs` + policy 树烘焙进镜像，容器内实测：
     `prometheusBash:false`、`prometheusSrcWrite:false`；
   - 同一纯函数在仓库内 241 项测试覆盖（`guard-decision.test.mjs`）。
9. [x] E04 prompt 身份段接入（第四轮）：
   - 插件 `inject: ['tools','systemPrompt']`（persona 行同款模式）；
   - `omo:identity`（order -50，persona 之前）经 `ctx.effect(() => ctx.systemPrompt.section(...))` 注册；
   - 容器加载验证：`inject:["tools","systemPrompt"]`、`hasIdentitySection:true`；
   - 动态 per-role section 待 scope→agent 映射核实后接入（`src/continuation/DSH-BINDING.md`）。
10. [x] 终验复跑（2026-08-16）：镜像重建 → boot 200 → discovery healthy →
    插件注入面 `["tools","systemPrompt"]` → 守卫决策 `prometheusBash:false` →
    停止无残留。
11. [x] 真实模型回合解锁（NVIDIA NIM，owner 授权 `--env-file` 注入，key 零落地）：
    - 容器内 hand-declared `nvidia` 路由（api: openai-completions, baseURL NIM）
      首次真实回合输出 `OK`；
    - headless bundle 在镜像快照中接入 `agentPresets.mount(agentCtx, 'omo')` +
      `agent-presets` service insert（仅测试镜像；上游注释明确部署须在此处 join preset）；
    - 会话日志证据：`omo_role_status` 出现在挂载会话的工具目录（kimi run ×4）；
    - 挂载会话内工具管线实跑：`tool/call` + `tool/result` 各 1（llama-3.3-70b）；
    - 模型端仍有缺口：NIM deepseek-v4-flash-0731 工具回合挂起、llama 误把
      omo_role_status 当 skill——需换工具调用更强的模型（openai/gpt-oss-120b）
      或调 prompt，下一轮继续。
12. [x] **G1 核心里程碑**（openai/gpt-oss-120b）：
    - 挂载错误链修复：agent-presets service insert + `config.default: omo`、
      tool-fs-search 必填 config、镜像内插件树 chmod a+rX；
    - 会话日志权威证据：`tool/call: omo_role_status` + `tool/result`（模型真实调用
      OMO 工具并执行成功）；
    - **角色切换 live 证据**：`tool/call: omo_role` →
      `role event: {"role":"prometheus","revision":1,"changedBy":"user","reason":"g1"}`；
    - bash guard deny 的 live 观察仍差一步（gpt-oss 在 role call 后 stream 超时）；
    - 评测 harness 就绪（`run-eval.sh`/`parse-evidence.mjs`，逐场景 fresh session +
      机器证据 + transcript，summary 入库、raw 证据在 /tmp）。
13. [x] **bash-deny live 观察补全**（2026-08-16，openai/gpt-oss-120b，独立 guard 探针）：
    - 同一会话先 `tool/call: omo_role`（role=prometheus）→ `omo/role` 事件
      `{role:"prometheus",revision:1,changedBy:"user",reason:"g1"}`；
    - 随后 `tool/call: bash`（command `echo hi`）→ `tool/result`
      `isError:true`，文本 `Error: omo role prometheus denies bash`——守卫**拒执**
      而非静默通过，且未产生任何 shell 执行；
    - 证据文件：`/tmp/omo-guard2.jsonl`（tool/call 与 tool/result 事件逐条）；
      parity.json `PAR-ROLE-001.liveEvidence` 已回填。
14. [x] **角色→Todo→状态 单一会话管线探针**（2026-08-16，openai/gpt-oss-120b）：
    - 同一 headless 会话内三步连发全部落地：
      `omo_role(role=prometheus, reason=eval-probe)` → `omo/role` 事件
      `{role:"prometheus",revision:1,changedBy:"user",reason:"eval-probe"}`；
      `todo_write([{content:"T1 setup LRU cache",status:"pending"}])` →
      `todo/write` 事件（owned 列表原样）；`omo_role_status` → 确认
      prometheus revision 1；
    - 证据文件：`/tmp/omo-probe3.jsonl`；parity.json `PAR-STATE-001.liveEvidence`
      已回填。深行为证据来源说明：17 场景 E2E 因模型吞吐（5-8 分钟/回合）
      多超时未达行为目标，定向探针承担行为证据（见 README 吞吐观察）。

15. [x] **G13 干净消费者演练**（2026-08-16，`drill-consumer.sh`，无模型调用）：
    - 载荷 digest 门通过（77 文件 pinned）；
    - 仅含 preset 三文件的全新 DSH_HOME（无 repo 挂载、无 node_modules overlay）：
      `discoverPresets` → `{"id":"omo","broken":false}`；
    - 消费者内插件模块加载：`{name:"omo-role",inject:["tools","systemPrompt"],hasApply:true}`；
    - 证据：`/tmp/omo-drill/consumer-discovery.jsonl` + `consumer-plugin.jsonl`。

16. [x] **RC 镜像验证轮**（2026-08-16，`omo-dsh-test-rc2`，主 tag 全程未动）：
    - 构建 113s（层缓存）；`DSH_IMAGE_TAG=rc2 drill-consumer.sh` 全绿
      （discovery `{"id":"omo","broken":false}` + 插件加载含新导入
      dynamic-sections/notification）；
    - G6' 动态段探针（gpt-oss-120b）：`omo_role(prometheus, g6-rc)` →
      role 事件 + `omo_role_status` 确认，**会话日志零插件错误**——动态段
      随角色变更的 dispose+重注册路径无异常；
    - 子代理 launch 标记二次 live 观察：E2E-08 场景日志再现
      `subagent/descriptor`（label "Tiny research: latest Node.js LTS version"）。
    - 主 tag 切换：待 17 场景评测结算后执行（runbook 重建序列）。

17. [x] **P2 结算绑定 live 闭环**（2026-08-16，rc5 镜像 + opencode-go/deepseek-v4-flash）：
    - 父会话日志（含 "Call the subagent" 原始指令 + subagent 工具调用）出现
      `omo/notification` `{source:"subagent-end", childSessionId:null,
      status:"completed", summary:"subagent settled"}`——post-execute 监听器
      父侧权威落地；
    - 子会话日志同时出现 `{childSessionId:"<child-id>", status:"completed"}`——
      subagent/end 监听器子侧审计落地（info.id 语义与源码一致）；
    - 迭代链：rc3（通知落子会话→定位 pre-execute 未捕获父会话）→ rc4
      （ctx.agent 不可用于 mount 上下文，live 实证）→ rc5（双监听器闭环）；
    - 证据：/tmp/omo-probe10-*.jsonl（父/子双日志）。
    - 遗留：P2 的下一回合 pending 注入仍需 prompt-section 绑定（事件面已完整）。

18. [x] **P2 通知注入绑定**（2026-08-16，rc6 镜像 + opencode-go/deepseek-v4-flash）：
    - 单会话全序列：subagent 调用 → 父侧 `omo/notification`（post-execute）
      → pending 推入 + `omo:notifications` 段刷新 → **下一回合**模型调用
      `omo_role_status` 正常 → `turn/end` 注入一次后清空；全程零插件错误；
    - 子侧审计通知同现（child id 完整）；
    - 证据：/tmp/omo-probe11-out.txt + 父/子双日志（turn/end 事件可见）。

19. [x] **P4 终端族 live 闭环**（2026-08-17，rc10 镜像 + opencode-go/deepseek-v4-flash）：
    - preset 增 pty-family isolate 组（terminal-service 插件包装器 +
      terminal-bash + tool-terminal，entry shim 解析）；
    - `terminal_open {type:shell,name:main}` → `started terminal session
      pty-1 (main) [type: shell]`（PTY 真实启动）；`terminal_list` →
      `pty-1 (main) [shell] running pid=18`（owner-scoped 注册表真实列出）；
    - 前置修复：prepare-home 增 `permission.defaultPreset:
      danger-full-access`（镜像宿主部署行为；此前容器无 sandbox 后端导致
      shell/PTY 全拒，也是历次 E2E bash 失败根因——本次一并修复）；
    - 证据：/tmp/omo-probe18-out.txt + 会话日志。

20. [x] **主镜像切换**（2026-08-17，`omo-dsh-test:latest` = rc 全部已验证内容）：
    - consumer drill 全绿（77 文件 digest + discovery + 插件加载）；
    - 组合冒烟一次通过：`omo_role(prometheus, main-final)` → 角色事件；
      `terminal_open` → `started terminal session pty-1 (main)`；
      `terminal_list` → `pty-1 (main) [shell] running pid=17`；
    - 主 tag 现含：动态段 + P2 双监听器 + 注入段 + pty-family isolate 组 +
      bubblewrap + 权限预设。

21. [x] **3 项 n/a 硬门专用探针**（2026-08-17，opencode-go/deepseek-v4-flash）：
    - 跨会话隔离 PASS：同 home 两会话——会话 1 切 prometheus（role 事件仅其
      日志），会话 2 `omo_role_status` 报 sisyphus revision 0（自身 fold 不受
      污染）——角色状态严格按会话隔离；
    - 取消/处置静止 PASS：长会话 mid-run docker kill → `docker run --rm`
      无残留、home 完好；同 home 后续会话正常（status 正常返回）；
    - 最终证据门如实记录：模型知晓"系统提示要求机器证据"，但显式用户指令
      （"不得使用工具"）可覆盖并虚构完成——**证据门为 prompt 级而非代码强制**
      （Batch A 从未宣称代码强制；`verification/evidence.mjs` 的执行期绑定
      属后续 G 项）；证据：/tmp/hg-evidence.txt。

22. [x] **Soak（20 轮连续会话稳定性）**（2026-08-17，opencode-go/deepseek-v4-flash）：
    - 20 轮顺序 `omo_role_status` 会话全部返回角色状态（sisyphus revision 0），
      零插件错误、零残留（`docker run --rm`）；初判 10/20 "失败" 为 grep
      模式误判（输出文本为 "OMO primary role"），复核为 **20/20 通过**；
    - 证据：/tmp/soak-1..20.txt。

23. [x] **G8 Boulder 角色镜像 live 闭环**（2026-08-17，rc12 + opencode-go/flash）：
    - `omo_role(prometheus, g8-mirror)` → 会话日志事件 + 镜像文件原子写入
      `<DSH_HOME>/workspace/.omo/role.json`（schemaVersion 1, prometheus
      revision 1, reason g8-mirror——temp+rename 原子写）；
    - `omo_boulder_role` 工具读回 → `Boulder role mirror: prometheus
      (revision 1)`——与会话 fold 一致；ADR-R16 跨重启权威面 live 工作；
    - 证据：/tmp/omo-probe19-out.txt + 镜像文件内容（上述）。

24. [x] **G9 续跑 turn-stopping live**（2026-08-17，rc13 + opencode-go/flash）：
    - 测试镜像 headless 打补丁续跑环（≤5 回合、driver 判定、逐回合
      `omo/continuation` 审计事件、真实 todo 折叠）；
    - 探针：模型建 2 项 todo → 2 次 todo/write（in_progress→completed）→
      回合边界 driver 判定 `{decision:"verifying", reason:"all todos
      complete — final verification required before done"}`（Final
      Verification Wave 语义）→ 模型完成收尾；turns=1（判定非 continue
      即止，无空转）；
    - 证据：/tmp/omo-probe20-out.txt + 会话日志。

25. [x] **G10 memory 写绑定 live**（2026-08-17，rc14 + opencode-go/flash）：
    - 良性内容：`omo_memory_write(scope=session, consent=true)` →
      `omo/memory-write` 审计事件（scope/sessionId/content/at）→
      "memory written"；
    - 密钥内容：模型层自预判拒写（"I won't persist a credential-shaped
      string"）+ 工具层代码闸（policy secret-sniff，纯测试覆盖）双保险；
    - 证据：/tmp/omo-probe21/22-out.txt + 会话日志。

26. [x] **G10 全门控绑定 live**（2026-08-17，主镜像 + opencode-go/flash）：
    - 组合冒烟一次通过：`omo_team_status`（disabled 门控）+
      `omo_openclaw_status`（disabled 门控 + 脱敏就绪）+
      `omo_monitor_status`（monitors: 1）+ `omo_boulder_role`（missing——
      无角色切换故镜像正确缺失）；
    - mount 校验闸抓出 schema 缺陷（items object 缺 additionalProperties），
      修复后主镜像重建验证——DSH 运行时验证层工作如设计。
    - 证据：/tmp/omo-final3.txt + 会话日志。

27. [x] **G8 工作镜像 live**（2026-08-17，rc16 + opencode-go/flash）：
    - 续跑环每回合边界把 todo 快照原子镜像（temp+rename）到
      `<DSH_HOME>/workspace/.omo/work.json`；探针会话两项 todo 完成后镜像
      文件记录 `{schemaVersion:1, todos:[completed×2], at}`；
    - 崩溃安全由原子写模式承载（boulder-crash.test.mjs 单元覆盖
      "rename 前崩溃保留旧文件"）；ADR-R16 跨重启权威现覆盖角色+工作两层。

## 仍未执行（需要真实模型会话，属后续部署门）

- 双 Session + `omo/role` 事件 + flush 的生命周期（当前 preset 尚未挂接 role 事件插件，
  需 Phase 2 的 DSH 侧插件接入后再在容器内执行）；
- child spawn / stop / resume / unmount 资源计数；
- 未知 required event 拒绝、continuable+outputSchema 拒绝等行为层验证
  （已由 100 项 `node --test` 合同级覆盖，容器内行为层验证随插件接入补做）。

## 证据收集命令

```bash
docker logs omo-dsh-test-web
docker exec -e DSH_HOME=/home/node/.dsh omo-dsh-test-web node --input-type=module -e \
  "const {discoverPresets}=await import('file:///dsh/packages/preset/agent-presets/lib/index.js'); \
   const {join}=await import('node:path'); \
   const root={path:join(process.env.DSH_HOME,'.agent-presets'),writable:true}; \
   for(const p of await discoverPresets([root])) console.log(JSON.stringify({id:p.id,name:p.name,broken:p.broken??false}))"
```
