# TASK-02 — Reset & Regenerate Drizzle Migrations (fix `edges.attributes` drift)

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-01 · **Size:** M
> **Self-contained:** yes. Read the files you edit, but no other background is required.

## 1. Context
The database layer has **two physical databases** with **two drizzle-kit configs**:
- `packages/database/drizzle.router.config.ts` → global `vozlab_router` (`router.schema.ts`).
- `packages/database/drizzle.tenant.config.ts` → per-tenant DB (`tenant.*.schema.ts`, glob
  deliberately excludes `router.schema.ts`).

A verified **drift** exists: the Drizzle schema and the repository code use
`edges.attributes` (`jsonb`), but neither the migration SQL nor the drizzle snapshots contain
that column. Concretely:
- `packages/database/src/schema/tenant.public.schema.ts` defines `attributes` on `edges`.
- `apps/api/src/infrastructure/persistence/repositories/DrizzleEdgeRepository.ts` inserts and
  reads `attributes`.
- `packages/database/migrations/tenant/00{00,01}_*.sql` do **not** contain it.

**Decision taken (do not re-litigate):** *reset* the migrations and regenerate them from the
current schema. This is safe because no production tenant database exists yet.

## 2. Objective
Delete and regenerate the Drizzle migrations from the current schema so that migrations and
schema are perfectly in sync, and verify the result against a fresh database.

## 3. Project conventions (non-negotiable)
- **pnpm only**.
- NodeNext: relative `.ts` imports end with `.js`.
- Generated SQL/snapshots under `packages/database/migrations/**` are **generated artifacts —
  never hand-edit them**.
- `pnpm turbo run build` must pass before you are done.
- Two databases must never be mixed: router tables only in the router migration, tenant tables
  (`auth`, `meta`, `public`, `social`) only in the tenant migration.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Delete | `packages/database/migrations/router/**` (all files) |
| Delete | `packages/database/migrations/tenant/**` (all files) |
| Delete | `packages/database/scripts/init-age.sql` (redundant, and it runs against the wrong DB) |
| Regenerate (do not hand-edit) | `packages/database/migrations/router/0000_*.sql` + `meta/**` |
| Regenerate (do not hand-edit) | `packages/database/migrations/tenant/0000_*.sql` + `meta/**` |

## 5. Step-by-step instructions
1. `docker compose down -v` (drop the volume so initdb scripts re-run on a fresh DB).
2. Delete the two `migrations/**` trees and `scripts/init-age.sql`.
   Keep `scripts/01-create-databases.sql` and `scripts/02-extensions-and-graph.sql`.
3. Confirm `packages/database/src/schema/index.ts` re-exports all tenant schemas
   (`tenant.auth`, `tenant.meta`, `tenant.public`, `tenant.social`) and that
   `tenant.public.schema.ts` defines the `vector(768)` custom type and the HNSW/GIN/partial
   indexes. Do not modify the schema in this task.
4. Run:
   ```bash
   pnpm --filter @vozlab/database db:generate
   ```
   This must produce `migrations/router/0000_*.sql` and `migrations/tenant/0000_*.sql`.
   If the generator cannot resolve `.js` → `.ts` imports, retry with the tsx loader:
   `NODE_OPTIONS='--import tsx' pnpm --filter @vozlab/database db:generate`.
5. **Verify the generated tenant SQL by inspection** contains ALL of:
   - `CREATE SCHEMA "auth"`, `"meta"`, `"social"`;
   - the `edges` table **with** `"attributes" jsonb`;
   - `"embedding" vector(768)`;
   - `unique_user_target_vote` unique index;
   - `idx_nodes_embedding_hnsw ... USING hnsw ("embedding" vector_cosine_ops)`;
   - `idx_nodes_attributes_gin ... USING gin ("attributes")`;
   - `meta.datatype_properties` and `meta.object_properties`;
   - `social.discussion_threads` and `social.discussion_posts`.
   And verify the **router** SQL contains only `tenants` and `tenant_connections`.
6. Bring the DB up and apply migrations:
   ```bash
   docker compose up -d
   docker compose ps                     # postgres must be healthy
   pnpm --filter @vozlab/database db:migrate
   ```
7. Verify the live schema:
   ```bash
   docker compose exec postgres psql -U postgres -d vozlab_tenant_dev -c '\d edges'
   docker compose exec postgres psql -U postgres -d vozlab_tenant_dev -c '\dx'
   ```
   `edges` must show `attributes jsonb`; `\dx` must list `age` and `vector`.

## 6. Constraints & gotchas
- The docker volume mounts `packages/database/scripts/` into `docker-entrypoint-initdb.d`;
  those scripts run **only on a fresh volume**. Step 1 is mandatory.
- Do not change credentials. `docker-compose.yml` uses user/password `postgres` and DB
  `vozlab`; the scripts create `vozlab_router` and `vozlab_tenant_dev`.
- Do not add application code. If `edges.attributes` ends up missing again, the schema was
  edited after generation — regenerate once more.

## 7. Acceptance criteria
- [ ] No files remain under the old `migrations/**` (a single fresh `0000_*` per database exists).
- [ ] Tenant migration contains `"attributes" jsonb` on `edges` and all NFR-01/02 indexes.
- [ ] Router migration contains only `tenants` and `tenant_connections`.
- [ ] `\d edges` on a fresh DB shows `attributes jsonb`.
- [ ] `pnpm --filter @vozlab/database db:migrate` succeeds with no pending migrations.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
docker compose down -v && docker compose up -d
pnpm --filter @vozlab/database db:generate
grep -n "attributes" packages/database/migrations/tenant/0000_*.sql
pnpm --filter @vozlab/database db:migrate
docker compose exec postgres psql -U postgres -d vozlab_tenant_dev -c '\d edges'
pnpm turbo run build
```

## 9. Definition of done / handoff
- Build passes and the live schema matches the Drizzle schema.
- Mark `TASK-02` as `[x]` in `TODO.md` with a one-line note (e.g. "reset+regenerated; edges.attributes present").
- Commit the regenerated migrations **and** the deletion of `init-age.sql` together.

## 10. Out of scope
- Adding new tables/columns (do not modify the schema).
- The dev seed data (that is TASK-17).
