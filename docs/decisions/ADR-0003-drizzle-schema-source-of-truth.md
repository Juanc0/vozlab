# ADR-0003: Drizzle schema is the single source of truth for migrations

- Status: Accepted
- Date: 2026-10-19

## Context

A verified drift existed between the Drizzle schema and the generated migrations: `edges.attributes` was defined and used by the repository, but the migration SQL did not contain it. There was no production tenant database at that point, so a destructive reset was safe. The repository also had two migration trees that must never be mixed: router and tenant.

## Decision

The Drizzle schema under `packages/database/src/schema/` is the source of truth. Migrations are generated from it and are never hand-edited.

- Reset both migration trees and regenerate one fresh `0000_*` set per database from the current schema. This was a one-time action justified by the absence of production data.
- Keep two drizzle-kit configs: `drizzle.router.config.ts` (router schema, `migrations/router/`) and `drizzle.tenant.config.ts` (tenant schemas, `migrations/tenant/`). Router tables never appear in the tenant tree, and vice versa.
- Generated SQL and snapshots are build artifacts. Future schema changes follow: edit the schema, run `db:generate`, review and commit the generated files.
- Both local configs set `ssl: false`. drizzle-kit 0.31 defaults `ssl` to `{}` (TLS forced) when the key is absent, which breaks the local non-TLS PostgreSQL. This is a local-dev accommodation, not a production TLS policy.

## Consequences

### Positive

- The schema and the migrations agree; a fresh database can be built from the repository alone.
- The router/tenant boundary is enforced by configuration, not by developer discipline.
- Generated files are reproducible and reviewable in a diff.

### Negative / costs

- Resetting is only safe before a production database exists. Once a database holds data, migrations must be additive and forward-only; this ADR does not authorize another reset.
- The forced `ssl: false` must be revisited for any environment that requires TLS on drizzle-kit connections.
- Generated migrations and snapshots are large and noisy, and a careless schema edit can still produce a destructive diff.

## Links

- `docs/archive/tasks/TASK-02_reset-and-regenerate-drizzle-migrations.md`
- `docs/archive/history/TODO-phase-1T.md` — TASK-02 result note
- `packages/database/drizzle.router.config.ts`
- `packages/database/drizzle.tenant.config.ts`
- `packages/database/migrations/router/`, `packages/database/migrations/tenant/`
- `docs/archive/spec-v1/modules/modules_01_data_model_and_metamodel.md` §4.1–4.3
