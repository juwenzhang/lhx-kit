---
'@lhx-kit/cli': patch
'@lhx-kit/config': patch
'@lhx-kit/offline': patch
'@lhx-kit/renderer': patch
'@lhx-kit/runtime': patch
'@lhx-kit/vite-plugin': patch
---

Type-safety + lint hygiene sweep — no public API changes:

- Removed every `any` / `as any` from `packages/*` source. Replaced with `unknown` + typed shape (`viteExports` rolldown probe) and `unknown` → restrictive cast (`UserConfig['build']['rollupOptions']`, `Record<string, unknown>`) for Vite 8 surface that isn't in Vite 5/6/7 typings.
- Cleared all 33 Biome warnings: `noNonNullAssertion` (replaced `!` with explicit narrowing), `noAssignInExpressions` (extracted regex `.exec` into separate statements), `useTemplate` (string concat → template literals), `useOptionalChain`, `useConsistentArrayType`, unused imports/parameters.
- Switched `.changeset/config.json` from `fixed` to `linked`: package versions stay aligned, but unchanged packages no longer get re-published with empty changelogs every release.
