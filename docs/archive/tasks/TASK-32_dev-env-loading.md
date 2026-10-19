# TASK-32 — Load `.env` in `dev`/`start` (dev boot ergonomics)

> **Batch:** Phase 1T.1 (Correctness & Bootstrap) · **Depends on:** TASK-18 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TASK-18 created `.env.example` whose first line says *"Copy to `.env` and fill in. `.env` is
git-ignored."* But nothing loads `.env`:

- `tsx` has **no** dotenv support (`apps/api/node_modules/tsx/package.json` depends only on
  `esbuild`), and `dotenv` is not a dependency anywhere in the monorepo.
- `apps/api/package.json` runs `dev: "tsx watch src/index.ts"` and `start: "tsx src/index.ts"` —
  neither passes `--env-file`.
- `packages/database/package.json`'s `db:mint-token` reads `process.env.JWT_SECRET` directly.

Result: a developer who follows `.env.example` still hits `❌ Invalid environment variables` and
`process.exit(1)` at boot. This also blocks every manual/E2E check (the same reason TASK-19/23/25
handoffs say "could not exercise the HTTP path").

## 2. Objective
Make `pnpm --filter @vozlab/api dev` and `start` read the repo-root `.env` automatically (when it
exists), without committing secrets and without changing runtime behaviour in production (where
env comes from the orchestrator).

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- No secret is ever committed; `.env` stays git-ignored (`!.env.example` is the only exception).
- `env.ts` remains the single Zod validation point; do not add a second env parser.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/package.json` (`dev` / `start` scripts) |
| Edit | `packages/database/package.json` (`db:seed:dev` / `db:mint-token`, if they read `.env`) |
| Edit | `.env.example` (header instruction) |
| Edit | `apps/api/README.md` **or** the relevant section of `apps/api/package.json` docs (only if a README exists) |
| Edit | `docs/devops/devops_*` (one paragraph: how the local `.env` is loaded) |

## 5. Step-by-step instructions
1. **Preferred (no dependency):** pass the file to Node via `tsx`. Node ≥ 20.6 supports
   `--env-file`; `tsx` forwards unknown node flags. Use a tolerant form so a missing `.env` does not
   crash local dev:
   ```jsonc
   // apps/api/package.json
   "dev":   "tsx --env-file-if-exists=.env watch src/index.ts",
   "start": "tsx --env-file-if-exists=.env src/index.ts"
   ```
   If `--env-file-if-exists` is not accepted by the installed `tsx`/Node combination, fall back to
   adding `dotenv` as a **devDependency** and calling `dotenv.config({ path: '.env' })` as the first
   statement of `apps/api/src/index.ts` (before importing `env.ts`), guarded so production does not
   depend on the file.
2. Do the same for `packages/database` scripts (`db:seed:dev`, `db:mint-token`) so a developer can
   mint a token with the same `JWT_SECRET` the API boots with, without re-exporting it.
3. Update `.env.example`'s header to state exactly how it is loaded (e.g. *"Load it via
   `pnpm --filter @vozlab/api dev`; the API reads the repo-root `.env`"*).
4. Add one paragraph to `docs/devops` describing the local env loading and that production does
   **not** read `.env`.

## 6. Constraints & gotchas
- Do **not** log the salt, `JWT_SECRET` or any env value.
- Do **not** change the validation rules in `env.ts`; the point is only that the file is found.
- Keep the scripts working when `.env` is absent (CI/production) — a hard `--env-file` that errors
  on a missing file is not acceptable.
- If you add `dotenv`, put it in `devDependencies` and never commit a `.env`.

## 7. Acceptance criteria
- [ ] With only a copied `.env.example` → `.env`, `pnpm --filter @vozlab/api dev` reaches
      `🚀 VozLab API server running` (or fails on a real dependency, not on env validation).
- [ ] With **no** `.env`, the command still fails with the Zod message (expected), not an
      `ENOENT`/loader error.
- [ ] `pnpm --filter @vozlab/database db:mint-token -- --as maintainer` reads the same `JWT_SECRET`.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
cp -n .env.example .env            # only if not present; never commit it
pnpm --filter @vozlab/api dev      # must NOT print "Invalid environment variables"
# (stop the server with Ctrl-C)
git check-ignore .env && echo ".env still ignored"
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-32` `[x]` in `TODO.md` with a one-line result note naming
  the mechanism chosen (`--env-file-if-exists` vs `dotenv`).

## 10. Out of scope
- The OIDC auth endpoints.
- Adding new env variables (TASK-37 owns `AUTHOR_HASH_SALT` changes).
- Secret managers / vault integration.
