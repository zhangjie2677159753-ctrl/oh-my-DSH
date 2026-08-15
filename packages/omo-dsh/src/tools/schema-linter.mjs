// omo-dsh tool schema linter (OMO-0103).
// Enforces the DSH tool-schema discipline: parameter schema `type` values may only be
// string|number|integer|boolean|object|array|null. `json`/`text` inside parameters are
// illegal and can 400 every turn (2026-08-14 incident). String-or-array must use anyOf.
// Pure ESM; the CLI lives in ../../tools/lint-tool-schemas.mjs.

export const ALLOWED_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"])

export function lintTypeString(type) {
  if (typeof type !== "string") return `type must be a string, got ${typeof type}`
  if (!ALLOWED_TYPES.has(type)) {
    return `illegal type ${JSON.stringify(type)}; allowed: ${[...ALLOWED_TYPES].join("|")}`
  }
  return null
}

export function validateParameterSchema(schema, path = "parameters") {
  const errors = []
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    errors.push(`${path}: parameter schema must be an object`)
    return errors
  }
  if (schema.type !== undefined) {
    if (schema.type !== "object") errors.push(`${path}: parameter schema must be object-rooted (got type=${JSON.stringify(schema.type)})`)
    const t = lintTypeString(schema.type)
    if (t) errors.push(`${path}.type: ${t}`)
  }
  walkSchema(schema, path, errors)
  return errors
}

function walkSchema(node, path, errors) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkSchema(v, `${path}[${i}]`, errors))
    return
  }
  if (node === null || typeof node !== "object") return
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" && typeof value === "string") {
      const t = lintTypeString(value)
      if (t) errors.push(`${path}.type: ${t}`)
    } else if (key === "anyOf") {
      if (!Array.isArray(value)) errors.push(`${path}.anyOf: expected array`)
      else value.forEach((v, i) => walkSchema(v, `${path}.anyOf[${i}]`, errors))
    } else if (key === "items") {
      walkSchema(value, `${path}.items`, errors)
    } else if (key === "properties" || key === "additionalProperties") {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const [prop, propSchema] of Object.entries(value)) {
          walkSchema(propSchema, `${path}.${key}.${prop}`, errors)
        }
      } else {
        walkSchema(value, `${path}.${key}`, errors)
      }
    }
  }
}

// Safety net over raw source text: catches illegal quoted `type:` literals before
// any runtime executes, exactly like the incident grep check but structured.
export function scanSourceText(text) {
  const violations = []
  const lines = text.split("\n")
  lines.forEach((line, index) => {
    for (const m of line.matchAll(/\btype\s*:\s*["']([^"']+)["']/g)) {
      const error = lintTypeString(m[1])
      if (error) violations.push({ line: index + 1, type: m[1], error })
    }
  })
  return violations
}
