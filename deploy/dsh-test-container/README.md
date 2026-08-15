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
