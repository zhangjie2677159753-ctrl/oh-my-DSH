# UI 投影 → DSH Slot 绑定规格（G11）

纯件：无（UI 投影本身即宿主 Client 侧绑定，纯逻辑为 slot 选择器谓词，见下）。
本文件记录**实现时**的实时 Slot 合同，来源为运行中宿主 Client 的
`Slots.listSubTree` Inspect Provider 快照（非假设、非文档推断），
作为 G11「未注册 Slot——实现时 Inspect 实时 Slot 合同」的确定性输入。

> 快照日期：2026-08-17（本会话 live 探查）。
> 注意：此面随宿主 Client 演进可能漂移；接入前后各应重跑
> `Slots.listSubTree`（root 省略）校核，勿把本快照当长期真源。

## 投影目标（来自 GA-GAP-ANALYSIS G11）

- 把 OMO 会话状态（角色、守卫决策、结算通知、终端/P4 终端族）投影进
  DSH GUI，而**不替换** shipped UI；
- 首选 **replaceRisk: none** 的加法型 slot；avoid 替换单元素槽。

## 实时 Slot 合同（依 kind 分类）

### 加法型 list（replaceRisk: none，per-entry）

注册键固定为：

| 字段 | 类型 | 必填 |
|---|---|---|
| id | string | true |
| order | number | false |
| label | string \| (() => string) | false |

候选座（scope/session 语义见各条）：

- `conversation.input.dock`（session）— 会话输入框上方的整行座：
  queue rows / todo strip / goal bar 的既定席位。**OMO 状态行首选**。
- `conversation.composer.dock`（session）— 输入卡下方气氛读出行；
  shipped stats 行在此。结算/守卫摘要可落此。
- `conversation.session.header.utilities`（session）— 会话头右端工具位，
  不扰动 context/lineage。角色指示器适合放这里。
- `conversation.session.header.actions`（session）— 会话头动作行,
  每会话一个按钮的加法座。
- `conversation.input.left` / `conversation.input.right`（session）— 输入卡
  工具行两端的小型常驻控件。
- `sidebar.footer.action`（root）— 侧栏底部 Settings 旁的动作座。
- `shell.overlay`（root）— 帧级浮层（list），frame-wide 提示用。
- `settings.section` / `settings.general.item` / `settings.plugin.item`
  （root）— 设置页/偏好行/插件卡片。仅当 OMO 要暴露配置页时用。

### 链式 chain（replaceRisk: none，selector 路由）

注册键：`{ select: (owner) => unknown | null, required: true }`

- `conversation.composer`（session）— 输入区接管链：需按 owner 路由返回非空才接管。
- `conversation.chat.turnTail`（session）— 已定稿 assistant turn 的扩展链，
  渲染在该 turn 的 IconActions 之前。**turn 级 OMO 徽标/证据位。**
  注意：链式槽由 selector 决定是否接管；不满足返回 null 即不占用。

### keyed（replaceRisk: none 或 shadows-shipped-ui）

- `tool.call.toolview`（session，keyed，key=工具名）
  keyDomain 是开放集，已占用含 read/bash/glob/grep/edit/write/todo_write 等。
  `omo_role` / `omo_role_status` / OMO 终端工具的自定义卡片可在此 keyed 注册。
- `conversation.chat.commandview`（session，keyed，key=命令名，开放集未占用）— 命令行卡片。
- `conversation.chat.turnTail` 见上。

### 单元素 single（replaceRisk: shadows-shipped-ui）— **回避**

- `conversation.session`（渲染整个会话体）、`conversation.chat.node`、
  `sidebar`、`conversation`、`details`、`conversation.composer.bar`、
  `conversation.input.model`/`plan`、`conversation.hero.*` 等。
  这些槽若被占，等于替换 shipped UI——OMO 投影**不应**取，除非产品明确要
  整体换肤（Batch A 不在此列）。

## 绑定形态（与既有 DSH-BINDING 同纪律）

- 仅注册到 session 级 scope slot；非 session 关键状态（如全局角色）用
  `shell.overlay` 或 `conversation.input.dock`，勿碰单元素槽；
- 按 Inspect 返回的注册键（id/order/label 或 key/select）填充；
- `replaceRisk: none` 优先；任何 `shadows-shipped-ui` 的槽接入前需 owner 签字；
- 接入后重跑 `Slots.listSubTree` 确认 occupant 列表含本投影，且 shipped
  槽未被顶替。

## 前置（缺一不接入）

- session 级容器验证环境就绪（与 G9 DSL-BINDING 同一环境）；
- owner 确认投影到 `conversation.input.dock` vs `composer.dock` 的取舍
  （状态行 vs 读出行，避免双份冗余）；
- 真实模型跑通一次「角色切换 → 投影刷新」的端到端回合（opencode-go 通道已就绪）；
- 回归：无投影时 shipped UI 不受影响（slot 未占用即零渲染路径）；
  停止/卸载插件后投影消失、无残留 DOM。
