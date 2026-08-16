# Context/Rules/AGENTS 的 DSH 绑定 Spec（E19）

纯件（`context/rules.mjs`：层级合并、优先级、路径边界）已测试；
DSH 注入按下述接入。

## 已核验的注入面

- `systemPrompt` 的 `context` 注册（`PromptContext { name, order, text | provider }`）：
  rules/AGENTS/README 都作为 ordered context，而非拼进 persona；
- provider 函数每次 assembly 求值 → 目录变化可即时反映；
- `agent.inject()` 类合成 user message 用于文件变更/目录 AGENTS 通知
  （DSH 已原生注入 directory AGENTS 时不得重复注入）。

## 分层

1. rules：`mergeAgentsHierarchy` 输出最小 owned text → `systemPrompt.context`；
2. AGENTS：先探测 DSH 原生 AGENTS 注入能力；原生覆盖时我们的注入器**自动禁用**（避免重复）；
3. README：`createReadmeInjector` 每目录一次（reminders.mjs）；
4. 安全边界：`assertPathInsideRoot` 在发现阶段执行；宿主再查 symlink/TOCTOU。

## 前置（缺一不接入）

- session 级验证：注入内容与 DSH 原生不重复；
- 恶意 nested AGENTS 提权用例（context-guards-memory.test.mjs 已覆盖纯件部分）；
- 大仓库性能预算（发现缓存 + 截断上限）。
