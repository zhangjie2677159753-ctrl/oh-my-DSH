// omo-dsh compaction policy config, pure part.
// Native-equivalence #1 compat patch (docs/plans/NATIVE-EQUIVALENCE-PROOFS.md §1).
// Verified at the fixed SHA:
// - OMO trigger constants: TIMEOUT 60_000 / THRESHOLD 0.78 / COOLDOWN 60_000
//   (hooks/preemptive-compaction-trigger.ts:14-16)
// - usageRatio = (tokens.input + tokens.cache.read) / actualContextLimit
// - per-agent summarization model: pluginConfig.agents[<key>].compaction.model
//   in "provider/model" form (hooks/shared/compaction-model-resolver.ts:13-33)
// DSH native (fixed SHA): compaction-basic config keys thresholdRatio
// (default 0.8), retainRatio (0.16), retainTokens, summarizationProvider,
// summarizationModel, maxTokens (8192), compactionRetries (1),
// maxOverflowRetries (1), modelPolicies[] (exact provider/model threshold
// overrides), auto (true).
//
// HONEST MAPPING: threshold 0.78 and retain 0.16 map exactly to config;
// cooldown/timeout constants are engine-internal in DSH (no config seam) and
// are kept here only for drift tests; per-agent summarization models have NO
// compaction-basic seam (modelPolicies are per-routed-target THRESHOLD
// overrides, not summarization routing) — identical values collapse to the
// global summarizationProvider/Model, differing values become deviations.

export const OMO_PREEMPTIVE_COMPACTION_CONSTANTS = Object.freeze({
  timeoutMs: 60_000,
  thresholdRatio: 0.78,
  cooldownMs: 60_000,
})

export const DSH_COMPACTION_DEFAULTS = Object.freeze({
  retainRatio: 0.16,
  maxTokens: 8192,
  compactionRetries: 1,
  maxOverflowRetries: 1,
})

/** Exact upstream per-agent compaction model resolver. */
export function resolveCompactionModel(agentConfigKey, agentsConfig, originalProvider, originalModel) {
  const agentConfig = agentsConfig?.[agentConfigKey]
  if (!agentConfig?.compaction?.model) return { providerID: originalProvider, modelID: originalModel }
  const model = String(agentConfig.compaction.model)
  const parts = model.split("/")
  if (parts.length < 2) return { providerID: originalProvider, modelID: originalModel }
  return { providerID: parts[0], modelID: parts.slice(1).join("/") }
}

/**
 * Build the DSH compaction-basic config that replicates OMO pressure policy.
 * Returns { config, deviations }. deviations lists per-agent summarization
 * models that cannot be expressed natively (differing values).
 */
export function buildCompactionConfig({ perAgentCompactionModels = {}, summarizationProvider = "", summarizationModel = "" } = {}) {
  const entries = Object.entries(perAgentCompactionModels)
  const values = [...new Set(entries.map(([, v]) => String(v)))]
  const deviations = []
  let provider = summarizationProvider
  let model = summarizationModel

  if (values.length > 0) {
    if (values.length === 1) {
      const parts = values[0].split("/")
      if (parts.length >= 2) {
        provider = provider || parts[0]
        model = model || parts.slice(1).join("/")
      }
    } else {
      for (const [agent, value] of entries) {
        deviations.push({ agent, compactionModel: value, reason: "per-agent summarization model has no compaction-basic seam" })
      }
    }
  }

  return {
    config: {
      thresholdRatio: OMO_PREEMPTIVE_COMPACTION_CONSTANTS.thresholdRatio,
      retainRatio: DSH_COMPACTION_DEFAULTS.retainRatio,
      summarizationProvider: provider,
      summarizationModel: model,
    },
    deviations,
  }
}

/**
 * Owned data constructor for the failed-preemptive-compaction notification
 * (upstream toast equivalent). Replicates the upstream user-facing text.
 */
export function buildCompactionFailedEvent({ sessionId, ratio, reason, at = new Date().toISOString() } = {}) {
  const percent = Math.round(OMO_PREEMPTIVE_COMPACTION_CONSTANTS.thresholdRatio * 100)
  return {
    type: "omo/compaction-failed",
    data: {
      schemaVersion: 1,
      sessionId: sessionId ?? null,
      ratio: ratio ?? null,
      reason: reason ?? "unknown",
      message: `Preemptive compaction failed: Context window is above ${percent}% of the model limit. ${reason ?? ""}`.trim(),
      at,
    },
  }
}
