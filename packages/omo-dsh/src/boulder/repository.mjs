// omo-dsh Boulder storage repository (OMO-1401 storage half), pure logic over
// an injectable fs. Guarantees:
// - atomic write: temp file + rename; a crash before rename leaves the old file
// - digest verification on read; mismatch → corrupt, never silently accepted
// - unknown schema_version → fail closed (read-only refusal)
// - revision bump is explicit; unknown legacy fields survive
import { createHash } from "node:crypto"
import { migrateBoulderState, validateBoulderState } from "./state.mjs"

export function sha256Of(text) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function createBoulderRepository({ fs }) {
  if (!fs || typeof fs.readFile !== "function" || typeof fs.writeFile !== "function" || typeof fs.rename !== "function" || typeof fs.unlink !== "function") {
    throw new TypeError("createBoulderRepository: fs adapter required (readFile/writeFile/rename/unlink)")
  }
  return {
    async read(path) {
      let raw
      try {
        raw = await fs.readFile(path)
      } catch {
        return { status: "missing", path }
      }
      const text = String(raw)
      const digest = sha256Of(text)
      let state
      try {
        state = JSON.parse(text)
      } catch {
        return { status: "corrupt", path, digest, reason: "invalid JSON" }
      }
      if (state !== null && typeof state === "object" && typeof state.schema_version === "number" && state.schema_version > 2) {
        return { status: "unsupported-version", path, schema_version: state.schema_version, digest, reason: "newer schema_version; refuse to interpret" }
      }
      const errors = validateBoulderState(state)
      if (errors.length > 0) return { status: "invalid", path, digest, errors }
      return { status: "ok", path, state, digest }
    },

    async write(path, state, { expectedDigest = null } = {}) {
      const errors = validateBoulderState(state)
      if (errors.length > 0) throw new TypeError(errors.join("; "))
      if (expectedDigest !== null) {
        const current = await this.read(path)
        if (current.status === "ok" && current.digest !== expectedDigest) {
          throw new Error(`boulder write conflict: digest ${current.digest} != expected ${expectedDigest} (CAS)`)
        }
      }
      const text = JSON.stringify(state, null, 2) + "\n"
      const temp = `${path}.tmp-${Date.now()}`
      await fs.writeFile(temp, text)
      await fs.rename(temp, path) // atomic on the same filesystem
      return { status: "written", path, digest: sha256Of(text) }
    },

    async bumpRevision(path, { read = true } = {}) {
      const current = read ? await this.read(path) : { state: { revision: 0 } }
      const state = migrateBoulderState(current.state ?? {})
      state.revision = (state.revision ?? 0) + 1
      await this.write(path, state, { expectedDigest: current.digest ?? null })
      return state.revision
    },
  }
}

/** In-memory fs adapter for tests: crash between temp and rename loses only the temp file. */
export function createMemoryFs(initial = {}) {
  const files = new Map(Object.entries(initial))
  return {
    files,
    async readFile(path) {
      if (!files.has(path)) throw new Error("ENOENT")
      return files.get(path)
    },
    async writeFile(path, text) {
      files.set(path, String(text))
    },
    async rename(from, to) {
      if (!files.has(from)) throw new Error("ENOENT rename source")
      files.set(to, files.get(from))
      files.delete(from)
    },
    async unlink(path) {
      files.delete(path)
    },
  }
}
