# TASK-31 — Vitest Domain Baseline (first real tests)

> **Batch:** Phase 1S.4 (Quality) · **Depends on:** TASK-24, TASK-27 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`apps/api/package.json` already has `"test": "vitest run"` and `vitest` in `devDependencies`, but
there is **no** `vitest.config.*` and no `apps/api/tests/` directory — Phase 4.1 (tests) has no
seed. The domain layer is pure (no Fastify/Drizzle/pg), which makes it the cheapest place to start
and the safest (no DB/Redis required).

Because every relative import ends in `.js` (NodeNext), Vitest/Vite must be told how to resolve
`.js` specifiers to the `.ts` sources.

## 2. Objective
Stand up a working Vitest setup and cover the pure domain + the two pure helpers introduced by
Phase 1S, so `pnpm --filter @vozlab/api test` is meaningful and green in CI.

## 3. Project conventions (non-negotiable)
- **pnpm only.**
- **NodeNext**: relative imports in test files end in `.js` too.
- `pnpm turbo run build` (`tsc --noEmit`) must still pass; tests are excluded from the build.
- No DB, no Redis, no network in these tests (unit only).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/vitest.config.ts` |
| Create | `apps/api/tests/domain/Node.test.ts` |
| Create | `apps/api/tests/domain/Edge.test.ts` |
| Create | `apps/api/tests/domain/EditProposal.test.ts` |
| Create | `apps/api/tests/domain/AuthorHash.test.ts` |
| Create | `apps/api/tests/infrastructure/keyset.test.ts` |
| Create | `apps/api/tests/application/CloseThreadUseCase.test.ts` |
| Edit | `apps/api/tsconfig.json` (exclude `tests`) if a `tsc` error appears |

## 5. Step-by-step instructions
1. Create `apps/api/vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   import type { Plugin } from 'vite';

   /** Resolve NodeNext `./x.js` specifiers to their `./x.ts` sources. */
   const nodeNextJsToTs: Plugin = {
     name: 'nodenext-js-to-ts',
     enforce: 'pre',
     resolveId(source, importer) {
       if (importer && source.startsWith('.') && source.endsWith('.js')) {
         return this.resolve(source.slice(0, -3) + '.ts', importer, { skipSelf: true });
       }
       return null;
     },
   };

   export default defineConfig({
     plugins: [nodeNextJsToTs],
     test: {
       environment: 'node',
       include: ['tests/**/*.test.ts'],
     },
   });
   ```
2. **`Node.test.ts`** — state machine: `DRAFT → PENDING/ACTIVE` ok; `REJECTED → ACTIVE` throws
   `DomainError` with code `ERR_INVALID_STATE_TRANSITION`; `updateAttributes` merges and bumps
   `updatedAt`. Construct entities directly (no mocks needed).
3. **`Edge.test.ts`** — `PENDING → ACTIVE` ok; `REJECTED → ACTIVE` throws; confirm there is **no**
   `softDelete` method behaviour left to test (TASK-24 removed it) — assert `'softDelete' in edge === false`.
4. **`EditProposal.test.ts`** — `approve`/`reject` only from `PENDING`; `autoApply` throws
   `ERR_UNMET_AUTO_APPLY_CRITERIA` when younger than 14 days or score < 10, and succeeds with
   `createdAt` 15 days in the past + `communityScore: 10`.
5. **`AuthorHash.test.ts`** — `fromRawOrIdentity` returns the input unchanged when given a valid
   64-hex value; otherwise derives a stable SHA-256 from `identity + salt` (same inputs → same
   output; different salt → different output). `fromString` rejects a non-hash.
6. **`keyset.test.ts`** — `decodeCursor(encodeCursor(date, id))` round-trips (same ms + id);
   malformed inputs (`''`, `'not|base64!!'`, a base64 of `'garbage'`) return `null`.
7. **`CloseThreadUseCase.test.ts`** — with an in-memory fake `IDiscussionRepository` (a plain
   object literal implementing the interface, no library): creator closes successfully and the
   fake records the status update; a non-author gets `ERR_AUTHORIZATION_FAILED`; a missing thread
   gets `ERR_THREAD_NOT_FOUND`; a foreign-workspace thread (TASK-22) gets `ERR_THREAD_NOT_FOUND`.
   Provide a no-op `IEventPublisher` fake.
8. Run `pnpm --filter @vozlab/api test` and fix until green. If `tsc --noEmit` starts type-checking
   `tests/**`, add `"exclude": ["tests"]` (or `"tests"` to the existing exclude) in
   `apps/api/tsconfig.json`.

## 6. Constraints & gotchas
- Do not add a test runner config at the repo root; keep it per-package (`apps/api/vitest.config.ts`).
- Do not import `@vozlab/database` or any adapter in these tests — fakes only.
- Do not assert on log output or timestamps beyond `>=` comparisons (flaky).
- Keep each test file focused; do not build a fixture framework yet.
- The `nodeNextJsToTs` plugin must not rewrite package imports (`@vozlab/*`) — only relative ones.

## 7. Acceptance criteria
- [ ] `pnpm --filter @vozlab/api test` runs and passes (≥ 6 test files).
- [ ] No test opens a DB/Redis/network connection.
- [ ] `pnpm turbo run build` still passes (3/3) and does not type-check `tests/**`.
- [ ] The `.js` → `.ts` resolution works (tests fail to even load without the plugin).

## 8. Verification commands
```bash
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-31` `[x]` in `TODO.md` with the test count and the note that
  CI (Phase 4) can now run `test` as a Turbo task.

## 10. Out of scope
- Integration tests (DB/Redis/HTTP) — a later milestone.
- Coverage thresholds, k6, CI wiring.
- Testing controllers/adapters.
