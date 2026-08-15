// omo-dsh staging entrypoint.
// Batch A only: no DSH imports or OMO-copied code land here yet.
export const OMO_DSH_STAGING = {
  name: "omo-dsh",
  stage: "batch-a",
  compatibility: {
    omoSha: "038ed0cbbefe2b40677b63867aeea0d16bc303e0",
    dshSha: "47f943859bef60e4160492346772ded9b24f765a",
  },
} as const

export const CONFORMANCE_PROFILES = [
  "opencode-compat",
  "senpi-compat",
  "dsh-hardened",
] as const
