import test from "node:test"
import assert from "node:assert/strict"
import { lintTypeString, validateParameterSchema, scanSourceText } from "../src/tools/schema-linter.mjs"

test("allowed types pass", () => {
  for (const t of ["string", "number", "integer", "boolean", "object", "array", "null"]) {
    assert.equal(lintTypeString(t), null)
  }
})

test("illegal json/text types fail (DSH 2026-08-14 incident)", () => {
  for (const t of ["json", "text", "any", "function"]) {
    assert.ok(lintTypeString(t) !== null, t)
  }
})

test("object-rooted parameter schema with anyOf string-or-array passes", () => {
  const schema = {
    type: "object",
    properties: {
      target: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    },
  }
  assert.deepEqual(validateParameterSchema(schema), [])
})

test("non-object-rooted parameter schema fails", () => {
  const errors = validateParameterSchema({ type: "array", items: { type: "string" } })
  assert.ok(errors.some((e) => e.includes("object-rooted")))
})

test("nested illegal type fails structurally", () => {
  const schema = { type: "object", properties: { q: { type: "json" } } }
  const errors = validateParameterSchema(schema)
  assert.ok(errors.some((e) => e.includes("illegal type")))
})

test("scanSourceText catches json anywhere and text only in schema context", () => {
  const source = [
    `params = { type: "object", properties: { a: { type: "json" } } }`,
    `render: () => [{ type: 'text', text: 'legit part type' }]`,
    `schema = { type: "object", properties: { q: { type: "text" } } }`,
    `ok: { type: 'string' }`,
    `subtype: 'json'`, // word-boundary: must NOT match inside subtype
  ].join("\n")
  const violations = scanSourceText(source)
  assert.deepEqual(violations.map((v) => [v.line, v.type]), [[1, "json"], [3, "text"]])
})

test("scanSourceText ignores event-data type tags outside schema context", () => {
  const source = [
    `const event = { type: "omo/role", seq: 1, time: 2 }`,
    `schema = { type: "object", properties: { q: { type: "any" } } }`,
  ].join("\n")
  const violations = scanSourceText(source)
  assert.deepEqual(violations.map((v) => [v.line, v.type]), [[2, "any"]])
})

test("scanSourceText reports line numbers", () => {
  const violations = scanSourceText("line1\nline2: { type: 'json' }\n")
  assert.deepEqual(violations, [{ line: 2, type: "json", error: `illegal type "json"; allowed: string|number|integer|boolean|object|array|null` }])
})
