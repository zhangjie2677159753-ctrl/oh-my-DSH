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
