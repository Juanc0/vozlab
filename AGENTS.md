<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# VozLab — Agent Notes

Multi-tenant knowledge-graph platform: Fastify API + SvelteKit 5 PWA + Python 3.12 AI workers, backed by PostgreSQL (Apache AGE graph + pgvector) and Redis Streams. The `/docs` tree is the approved specification (English); code, comments, and identifiers are English.

## Layout
- `apps/api` — the only app with real code. Hexagonal: `domain/` (pure), `application/use_cases/`, `infrastructure/{http,persistence,events}/`, `shared/`.
- `apps/web`, `apps/worker-extractor`, `apps/worker-relacionador`, `apps/worker-consolidador` — empty scaffolds (directories only, no `package.json`). They are not part of the build yet.
- `packages/database` — Drizzle schemas + migrations; `packages/shared-types` — Zod DTOs + central `ERROR_CODES`; `packages/ts-config` — shared tsconfig.
- Spec entry point: `docs/00_ARCHITECTURE_OVERVIEW.md`, then `docs/system|modules|devops/`.

## Commands (pnpm only — no npm/yarn setup)
- `pnpm turbo run build` — type-checks every TS package (`tsc --noEmit`). Run after any code change; it does **not** emit JS.
- `pnpm --filter @vozlab/api dev` — API via `tsx watch` (requires env vars, see below).
- `pnpm --filter @vozlab/database db:generate[:router|:tenant]`, `db:migrate[...]`, `db:push[...]` — two DBs, two drizzle-kit configs. `db:studio` uses the tenant config.
- `pnpm lint` / `pnpm format` at the root, or `pnpm --filter <pkg> lint`.
- `pnpm --filter @vozlab/api test` — Vitest is configured but no test files exist yet (`apps/api/tests/` is absent).

## Hard-to-miss conventions
- **NodeNext**: every relative import in `.ts` must end in `.js` (`./server.js`), even though the source file is `.ts`. Applies to all packages.
- `build` is `tsc --noEmit`; the API `start` script points at `dist/index.js`, which is never produced. Use `dev`/`tsx`, not `start`.
- `domain/` must not import Fastify, Drizzle, or `pg`. Dependencies are wired manually in the Composition Root (`infrastructure/http/server.ts` + `routes.ts`); there is no IoC container.
- **Two physical DBs, never mixed**: global `vozlab_router` (tenant registry) and a per-tenant DB (dev: `vozlab_tenant_dev`; schemas `auth`, `meta`, `public`, `social`). Router and tenant tables live in separate drizzle configs/migrations.
- Multi-tenant isolation is physical: repository methods take `tid` (internal tenant UUID), and `UnitOfWork.runInTransaction(tid, cb)` passes the `tx` handle to reuse across repositories.
- Every protected request needs `Authorization: Bearer <jwt>` **and** an `X-Workspace-ID` UUID header; guard order is `authGuard -> tenantWorkspaceGuard -> rateLimit` (`routes.ts`).
- Redis Streams: event `NODE_CREATED` is published to `stream:node_created`, post-commit and best-effort — a broker failure never rolls back persisted data.
- Env is Zod-validated at startup (`apps/api/src/shared/config/env.ts`); a missing/invalid var calls `process.exit(1)`. Required: `ROUTER_DB_HOST/USER/PASSWORD/NAME`, `REDIS_HOST`, `JWT_SECRET` (≥32 chars), all `OIDC_*` URLs. No `.env` is committed — you must supply these to run the API.

## Current state / gotchas (verified)
- The API has domain/application/infrastructure for Edges, Discussions, Votes (interactions), and Ontology, but `routes.ts` registers only nodes/proposals/health and `server.ts` instantiates only the node/proposal adapters. Those extra controllers/repos/use-cases are unreachable until wired in.
- No `.github/workflows` exists; CI is specified in `docs/devops/devops_01_*` but not implemented.
- `/docs` pins describe an older stack (drizzle-orm 0.34 / drizzle-kit 0.25, PostgreSQL 16). Actual installed: drizzle-orm 0.45, drizzle-kit 0.31, PostgreSQL 18 (custom image in `docker/postgres/Dockerfile`). Trust `package.json` + `docker/` over the docs.
- `docker-compose.yml` builds the custom Postgres image and mounts `packages/database/scripts/` as initdb scripts; they run only on a fresh volume.
- Root `.gitignore` ignores only `node_modules` — `.turbo/`, `dist/`, and `.env` are **not** ignored.
- `turbo.json` declares `.next/**` outputs (stale Next.js leftover); produces harmless warnings on build. The Turbo managed block above is auto-added — keep it.
- Repo ships curated agent skills under `.agents/skills/` (drizzle, vitest, zod, turborepo, …), tracked by `skills-lock.json`.

## Working conventions from existing instruction files
- `CLAUDE.md`: act as a senior engineering committee; when requirements are ambiguous, stop and ask with structured options + trade-offs before coding. Change one component at a time.
- `EXECUTION_PLAN.md` = milestone spec; `TODO.md` = live task panel.
  - `/next-task` (`.claude/commands/next-task.md`): take the next `[ ]` task, implement, run `pnpm turbo run build`, then mark it `[x]` in `TODO.md` with a result note.
  - `/review-arch` (`.claude/commands/review-arch.md`): audit `/docs` vs `EXECUTION_PLAN.md` vs `TODO.md` vs code, and report gaps.
