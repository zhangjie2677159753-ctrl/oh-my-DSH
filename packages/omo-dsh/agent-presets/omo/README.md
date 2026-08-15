# OMO Agent Preset（占位）

单一 OMO Agent Preset：sisyphus / hephaestus / prometheus / atlas 四个 Primary Role
通过 Session Log 的 `omo/role` event 与 role fold 切换，绝不用 `agentPresets.recompose()`
实现角色切换。

- 发布侧：preset 只贡献 per-session 工具、persona/prompt sections、guard、routing middleware、
  continuation listener、context injection、compaction policy。
- 禁止：在 preset 内发布 process-global registry/service。
- 本目录在 Batch A 仅占位；cordis.yml 内容在角色 Runtime（Epic E04/E05）交付。
