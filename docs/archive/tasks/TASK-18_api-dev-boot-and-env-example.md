# TASK-18 — Fix API Dev Boot (`ERR_PACKAGE_PATH_NOT_EXPORTED`) + `.env.example`

> **Batch:** Phase 1S.1 (Bootstrap) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`pnpm --filter @vozlab/api dev` (`tsx watch src/index.ts`) fails **before boot** with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. Root cause (verified):

- `apps/api/package.json` has **no** `"type": "module"`, so `tsx` loads `src/index.ts` as CJS.
- `@vozlab/database` and `@vozlab/shared-types` declare `exports: { ".": { types, import } }`
  only. A CJS `require` matches neither `types` nor `import` → resolution fails.

Reproduce: `cd apps/api && node -e "require.resolve('@vozlab/database')"` →
`Error [ERR_PACKAGE_PATH_NOT_EXPORTED]`.

There is also **no `.env.example`**, so nobody can see which variables the API needs.

## 2. Objective
Make `tsx src/index.ts` resolve workspace imports so the API reaches env validation and boots
when the env is provided, and document the required env in a committed `.env.example`.

## 3. Project conventions (non-negotiable)
- **pnpm only.**
- **NodeNext**: relative imports in `.ts` end in `.js`.
- `pnpm turbo run build` (= `tsc --noEmit`) must pass.
- Do not change application behaviour in this task; module resolution + docs only.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/database/package.json` |
| Edit | `packages/shared-types/package.json` |
| Create | `.env.example` |
| Edit (optional) | `apps/api/package.json` (`start` script) |

## 5. Step-by-step instructions
1. In **both** workspace packages, add `require` and `default` conditions to the `.` export so
   CJS consumers resolve. Keep `types` first, then `import`, `require`, `default`:
   ```json
   "exports": {
     ".": {
       "types": "./src/index.ts",
       "import": "./src/index.ts",
       "require": "./src/index.ts",
       "default": "./src/index.ts"
     }
   }
   ```
   Reason: under `tsx`, a `.ts` target is transpiled on the fly; the condition is what matters for
   resolution, not the file extension.
2. Create `.env.example` at the repo root listing every variable validated in
   `apps/api/src/shared/config/env.ts` (read the file; keep the same names), grouped and with
   safe local defaults. Include at least: `NODE_ENV`, `PORT`, `HOST`, `ROUTER_DB_HOST/PORT/USER/PASSWORD/NAME`,
   `REDIS_HOST/PORT/PASSWORD`, `JWT_SECRET` (note: ≥ 32 chars), `OIDC_CLIENT_ID`,
   `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_AUTH_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL`,
   `OIDC_SCOPES`, `OLLAMA_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`,
   `RATE_LIMIT_READ_MAX`, `RATE_LIMIT_WRITE_MAX`, `RATE_LIMIT_WINDOW_MS`, `LOG_LEVEL`, `LOG_PRETTY`.
   Add a top comment: "Copy to `.env` and fill in. `.env` is git-ignored." Use the docker-compose
   local values (`postgres/postgres`, `localhost`). **Do not** commit a real `.env`.
3. (Optional, low risk) In `apps/api/package.json`, change `"start": "node dist/index.js"` to
   `"start": "tsx src/index.ts"` — `build` is `tsc --noEmit` and never emits `dist/`.

## 6. Constraints & gotchas
- Do **not** set `"type": "module"` on `apps/api`; adding the export conditions is the smaller,
  lower-risk fix and keeps every other package CJS-compatible.
- Do not edit the Turborepo managed block in `AGENTS.md`.
- `pnpm turbo run build` caches; if a package does not rebuild, run with `--force` to confirm.

## 7. Acceptance criteria
- [ ] `cd apps/api && node -e "require.resolve('@vozlab/database')"` no longer throws.
- [ ] The same for `@vozlab/shared-types`.
- [ ] `.env.example` exists and lists every var from `env.ts`.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
cd apps/api && node -e "require.resolve('@vozlab/database'); require.resolve('@vozlab/shared-types'); console.log('ok')"
cd ../.. && pnpm turbo run build
cd apps/api && timeout 20 pnpm exec tsx src/index.ts   # must NOT print ERR_PACKAGE_PATH_NOT_EXPORTED
```
With no env set, the command must exit with the Zod "Invalid environment variables" message
(exit code 1) — that proves module resolution is fixed.

## 9. Definition of done / handoff
- Run `pnpm turbo run build` (must pass) and the `tsx` probe above.
- Mark `TASK-18` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- The OIDC auth endpoints, the dev token script (TASK-19), or any `env.ts` schema change
  (TASK-20 adds `AUTHOR_HASH_SALT`).
