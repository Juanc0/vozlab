# TASK-17 — Dev Seed: Provision Tenant + Base Ontology

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-02, TASK-05 · **Size:** M
> **Self-contained:** yes.

## 1. Context
The documentation assumes a tenant is **provisioned** before use, but no code inserts anything
into the router DB (`tenants`, `tenant_connections`) or seeds a base ontology in a tenant DB.
Consequences:
- `TenantWorkspaceGuard` resolves a tenant from `vozlab_router`; with no rows it always returns
  `403 ERR_TENANT_NOT_PROVISIONED`. The API is effectively unusable locally.
- US-00 requires a base ontology (`meta.ontology_classes` + `meta.datatype_properties`) when a
  workspace is created; nothing creates one.
- TASK-05's membership check needs at least one `auth.workspace_memberships` row and a user.

This task adds a **developer seed** so the API can be exercised end-to-end.

Facts you need:
- Router DB name: `vozlab_router` (tables `tenants`, `tenant_connections`).
- Dev tenant DB name: `vozlab_tenant_dev` (schemas `auth`, `meta`, `public`, `social`).
- Credentials (docker-compose): user/password `postgres`, host `localhost`, port `5432`.
- `createRouterDrizzle({host,port,database,user,password})` returns `{ db, pool }` for the router.
  For the tenant DB you can open a plain `pg` `Pool` + `drizzle(pool)` (as `ConnectionPoolManager`
  does) or reuse `drizzle-orm/node-postgres`.
- Schema exports in `@vozlab/database`: `tenants`, `tenantConnections` (router) and
  `workspaces`, `users`, `workspaceMemberships`, `ontologyClasses`, `datatypeProperties`
  (tenant). Drizzle column names are camelCase in TS, snake_case in SQL.

## 2. Objective
Add an idempotent dev seed script and a `pnpm` alias that provisions:
1. a router tenant + its physical connection row, and
2. a tenant-side workspace, a user + membership, and a small base ontology.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: every relative `.ts` import ends with `.js`.
- The seed must be **idempotent** (re-runnable): use deterministic UUIDs / `ON CONFLICT DO NOTHING`
  or check-then-insert.
- Do not hard-code secrets beyond the documented local dev defaults; read them from env with the
  same defaults as the drizzle configs (`ROUTER_DB_*`, `TENANT_DB_*`).
- `pnpm turbo run build` must pass.
- This seed is for **development only** — never wire it into app startup.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | seed script | `packages/database/scripts/seed-dev.ts` |
| Edit | scripts | `packages/database/package.json` (add `db:seed:dev`) |
| Edit | deps | `packages/database/package.json` (add `tsx` devDependency if needed) |

## 5. Step-by-step instructions
1. Write `seed-dev.ts` using fixed UUIDs (constants at the top) so it is idempotent:
   - **Router**:
     - insert tenant `{ id: TENANT_ID, slug: 'sabana', oidcTenantId: 'sabana',
       name: 'Universidad Sabana (dev)' }`;
     - insert `tenant_connections` `{ tenantId: TENANT_ID, host: 'localhost', port: 5432,
       database: 'vozlab_tenant_dev', user: 'postgres', password: 'postgres' }`.
   - **Tenant** (connect to the tenant DB):
     - insert workspace `{ id: WORKSPACE_ID, slug: 'general', name: 'General Campus' }`;
     - insert user `{ id: USER_ID, provider: 'OIDC_INSTITUTIONAL', authorHash: <64-hex>,
       fullName: 'Dev Maintainer', systemRole: 'ADMIN' }` (compute a stable 64-hex
       `authorHash`, e.g. `createHash('sha256').update('dev-maintainer').digest('hex')`);
     - insert membership `{ workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'ADMIN' }`;
     - insert base ontology classes (`Problem`, `Idea`, `Resource`) with `status: 'ACTIVE'`,
       `displayNames: { en: ..., es: ... }`, `proposedBy: <authorHash>`;
     - insert at least one `datatype_properties` row (e.g. `title`/`description`) and one
       `object_properties` row (e.g. `RELATES_TO` with domain/range `Problem`→`Idea`,
       `status: 'ACTIVE'`).
   Use `onConflictDoNothing()` on each insert.
2. Log a concise summary of the fixed UUIDs at the end (tenant id, workspace id, user id,
   authorHash) so the developer can mint a JWT / set the `X-Workspace-ID` header.
3. Add to `packages/database/package.json`:
   ```json
   "db:seed:dev": "NODE_OPTIONS='--import tsx' tsx scripts/seed-dev.ts"
   ```
   Add `tsx` to `devDependencies` if it is not already resolvable there, then run `pnpm install`.
4. Guards: if the DB is unreachable, print a clear error and exit non-zero. Close all pools at
   the end.

## 6. Constraints & gotchas
- `authorHash` must be a **valid 64-char hex SHA-256** (the `AuthorHash` value object rejects
  anything else). Do not use a human-readable string.
- Keep `oidcTenantId = 'sabana'` consistent with the expected JWT `tid` claim so the guard
  resolves. Document this mapping in the script header.
- Do not modify the schema or migrations here (that is TASK-02).
- Never run the seed automatically on `db:migrate`.

## 7. Acceptance criteria
- [ ] `pnpm --filter @vozlab/database db:seed:dev` runs successfully against a migrated DB, twice in a row (idempotent).
- [ ] After seeding, a request with `X-Workspace-ID = WORKSPACE_ID` and a JWT whose `tid = 'sabana'`
      passes `TenantWorkspaceGuard` (no more `ERR_TENANT_NOT_PROVISIONED`).
- [ ] `GET /api/v1/ontology` returns the three active classes.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
docker compose up -d
pnpm --filter @vozlab/database db:migrate
pnpm --filter @vozlab/database db:seed:dev
pnpm --filter @vozlab/database db:seed:dev    # idempotent second run
docker compose exec postgres psql -U postgres -d vozlab_router -c 'select slug, oidc_tenant_id from tenants;'
docker compose exec postgres psql -U postgres -d vozlab_tenant_dev -c 'select system_key, status from meta.ontology_classes;'
```

## 9. Definition of done / handoff
- Build passes; the seed is idempotent and unblocks manual API testing.
- Mark `TASK-17` as `[x]` in `TODO.md` with a one-line result note (include the seeded UUIDs).

## 10. Out of scope
- Production tenant provisioning via the Admin API (US-00) and the base-ontology catalogue per
  institution (this is a minimal dev fixture only).
