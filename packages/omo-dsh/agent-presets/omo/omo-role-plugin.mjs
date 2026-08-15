// Shim for the file-backed preset row (name: ./omo-role-plugin.mjs).
// The real module lives inside the DSH install at /dsh/omo-plugin/ so bare
// @deepseek-ai/* specifiers resolve through the install's real node_modules
// (Node ESM does not resolve through a symlinked node_modules directory).
// Canonical source: packages/omo-dsh/src/dsh-plugin/omo-role-plugin.mjs.
export * from 'file:///dsh/omo-plugin/omo-role-plugin.mjs'
