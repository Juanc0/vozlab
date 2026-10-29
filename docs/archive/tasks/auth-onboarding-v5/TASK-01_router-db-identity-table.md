# TASK-01 — Router DB identity table (global_users) + tenant linking

> **Batch:** Auth v5.1 · **Depends on:** none · **Size:** L
> **Self-contained:** yes.

## 1. Context
The router DB currently has `global_identities` (issuer, subject) and `global_identity_tenants`. The tenant DB has `auth.users` with email, fullName, authorHash, systemRole, globalIdentityId. Identity verification is split: the router knows the IdP identity, the tenant knows the user. For cross-tenant and external collaborators, the router must become the single source of truth for "who is this user".

## 2. Objective
Enrich the router DB identity table so it stores the full identity profile (email, email_verified, full_name, picture, last_login_at) and becomes the default verification route. Keep it free of workspace/role data.

## 3. Project conventions
- pnpm only. NodeNext: relative imports end in `.js`.
- Two physical DBs: router (`vozlab_router`) and tenant. Never mix.
- Drizzle schemas in `packages/database/src/schema/`. Migrations via `db:generate:router` / `db:migrate:router`.
- `pnpm turbo run build type-check test` must pass.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/database/src/schema/router.schema.ts` |
| Create | `packages/database/migrations/router/00XX_*.sql` |
| Edit | `apps/api/src/domain/ports/IRouterDatabase.ts` (if needed) |
| Edit | `apps/api/src/infrastructure/persistence/...` adapters |
| Edit | `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts` (read identity from router) |
| Test | `apps/api/tests/...` |

## 5. Step-by-step
1. Add columns to `global_identities` (or create `global_users`): `email`, `email_verified` (boolean), `full_name`, `picture`, `last_login_at`, `created_at` (already). Keep `issuer`, `subject` unique.
2. Add `global_user_tenants` columns if missing: `status` (ACTIVE/SUSPENDED/PENDING), `linked_at`, `linked_by` (global user id, nullable).
3. Generate migration: `pnpm --filter @vozlab/database db:generate:router`.
4. Update `CompleteOidcLoginUseCase` to upsert the global identity profile on login (email, email_verified, full_name, last_login_at) instead of only (issuer, subject).
5. Tenant DB `auth.users` keeps `globalIdentityId` reference; email/fullName in tenant DB become a cache that is synced from router (or removed in favor of reading from router). Decision: keep as cache, sync on login.
6. Update tests.

## 6. Acceptance criteria
- Router DB stores full identity profile.
- Login upserts profile in router DB.
- Tenant DB user references router identity.
- `pnpm turbo run build type-check test` passes.