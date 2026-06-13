---
name: DB lib rebuild requirement
description: When and why to run typecheck:libs after adding new schema tables
---

## Rule

After adding or modifying files in `lib/db/src/schema/`, always run `pnpm run typecheck:libs` before running leaf package typechecks.

## Why

`lib/db` is a composite TypeScript project. Leaf packages (`api-server`, `traintent`) import from `@workspace/db` via compiled declaration files. If those declarations are stale, the leaf typechecks will fail with "Module has no exported member" errors even though the source is correct.

## How to apply

Whenever you add a new table file to `lib/db/src/schema/`:
1. Export it from `lib/db/src/schema/index.ts`
2. Run `pnpm run typecheck:libs` (rebuilds all lib declarations)
3. Then run per-artifact typechecks

This also applies to `lib/api-zod` and `lib/api-client-react` after running codegen.
