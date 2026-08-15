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
