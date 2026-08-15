# tests/（占位）

测试分层（`docs/plans/ACCEPTANCE-AND-EVALUATION.md` §2）：

- unit/
- contract/  （对应 `docs/plans/compat-contracts.json` 的 35 项 DSH 合同）
- integration/
- replay/
- chaos/
- model-eval/

Batch A 的 vertical slice（OMO-0301/0302）验收必须证明 mount → 双 Session → child →
stop → resume → unmount 全生命周期无资源泄漏。
