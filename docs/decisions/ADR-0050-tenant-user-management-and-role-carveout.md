# ADR-0050 — Tenant user management and the role carve-out

- Status: Accepted
- Date: 2026-11-01
- Amends: ADR-0041 §9 (bootstrap) — the first tenant administrator is
  still created by `db:grant-tenant-admin` and the dev seed; ADR-0041's other
  clauses (§1 two administrators/two scopes, §2 `workspaceAdminGuard`, §3
  tenant-wide routes, §4 ontology provisioning, §5–§8, §10 audit) stand.
  ADR-0049 stands: there is no tenant bypass over workspace administration.
- Related: ADR-0008 (foreign-workspace resource answers 404), ADR-0013 (opaque
  pseudonym, no salt), ADR-0018 (JIT accounts, no implicit membership),
  ADR-0041 (tenant and workspace administration), ADR-0048 (split of the two
  surfaces), ADR-0049 (no bypass), `docs/auth-and-tenancy.md` §12 (role model,
  enforcement and ownership matrices), `docs/components/web-pwa.md`
  §Administration surfaces, `docs/archive/plans/tenant-user-management/v1.md` (T1–T4).

## Context

ADR-0041 §9 made the CLI the *only* door for `system_role` changes: "A CLI is
the only door, never the API." That rule was written when the only
administrative surface was the operator tooling, and it had two jobs:

1. **Bootstrap** — an institution with no administrator yet has no
   authenticated actor who could grant the role, so the first `ADMIN` must be
   seeded out of band (`db:grant-tenant-admin`, the dev seed).
2. **Emergency recovery** — when every tenant administrator is locked out
   (suspended, deleted, or otherwise unreachable), no API request can be
   authenticated as an administrator, so the only repair path is the operator
   CLI against the tenant database.

Both jobs are legitimate and neither can be served by an HTTP route. But §9
was also read as forbidding a tenant administrator from managing the roles of
*other, existing* users — which left an institution with no way to promote a
colleague, demote a departing administrator, or suspend a compromised account
without operator access. The tenant user directory shipped in
`admin-surfaces v1`/`v2` was read-only for exactly this reason, and the user
review of the admin panels (the `tenant-user-management` plan) rejected that
as unusable: an institution must be able to run its own user base.

The forces:

- Users arrive only through OIDC JIT (ADR-0018): there is no local
  credential store, no password, no "create user" endpoint. A tenant
  administrator therefore never *creates* a user; it only changes the role or
  session validity of a user who has already signed in. User creation stays
  out of scope (plan "Out of scope").
- `system_role` is per institution (ADR-0041 §1, ADR-0031): a global user
  linked to two institutions can be `ADMIN` in one and `USER` in the other.
  Promoting a user in tenant A must not touch tenant B, and the repository
  methods are scoped by `tid`.
- The role is read from the tenant database on every request (ADR-0041 §1,
  §12.2): a demotion or suspension takes effect on the next request, and a
  token never carries a role. No new JWT claim is introduced.
- A resource that belongs to another workspace answers 404, never 403
  (ADR-0008). Tenant administration is not workspace-scoped, so this rule does
  not apply to `/admin/users/*`; those routes answer with the tenant-admin
  authorization result (`403 ERR_AUTHORIZATION_FAILED` for a non-admin).
- Suspension must actually invalidate sessions. The access token is short-lived
  (15 min, ADR-0018) and carries a `jti`; the refresh token is rotating and
  stored. Stamping `sessionsValidAfter = now()` on `auth.users` makes every
  session issued before that moment stale (checked in `RefreshSessionUseCase`),
  and revoking the refresh tokens forces re-authentication immediately.
- The last tenant administrator must never be removable through the API: an
  institution with zero administrators has no recovery path except the CLI,
  which is exactly the emergency door §9 reserves.
- Anonymous event users (`provider = 'ANONYMOUS_EVENT'`) are created by the
  event join flow (ADR-0046) with a `GUEST` membership and no real identity;
  they must not be promotable or suspendable through this surface.

The alternatives considered were:

1. **Keep §9 absolute and build an operator-only "user management" CLI.**
   Rejected: it leaves the institution dependent on an operator for routine
   promotion/demotion/suspension, which is the exact pain the plan addresses,
   and it duplicates the HTTP surface that already exists for listing users.
2. **Let a tenant admin edit `system_role` for any user, including creating
   the first admin through the API.** Rejected: an unauthenticated or
   compromised-but-low-privilege path could escalate to tenant admin if the
   bootstrap were reachable through HTTP; the first admin must be seeded by an
   operator who has database access.
3. **Promote/demote only, no suspension.** Rejected: a compromised or
   departing account cannot be stopped without operator access; suspension with
   session invalidation is a core tenant-admin power.
4. **Carve out existing-user management from §9, keeping bootstrap and
   recovery on the CLI.** Chosen. A tenant `ADMIN` manages the roles and
   session validity of users who already exist in its tenant; the CLI remains
   the only door for the *first* tenant administrator and for emergency
   recovery when no administrator can authenticate.

## Decision

### 1. The carve-out

ADR-0041 §9 is amended, not repealed. The CLI remains the only door for two
things only:

- **Bootstrap** — creating the first tenant administrator of an institution
  (`db:grant-tenant-admin`, dev seed). No HTTP route creates an `ADMIN` from
  nothing; `PATCH /api/v1/admin/users/:userId` can only change the role of a
  user who already exists and is being acted on by an authenticated tenant
  `ADMIN`.
- **Emergency recovery** — repairing an institution with no authenticable
  tenant administrator (locked out, suspended, vanished). This is operator
  tooling against the tenant database, the same door as today.

Everything else about tenant users is an HTTP capability of a tenant `ADMIN`:

- Promote/demote an existing user between `USER`, `ADMIN` and `MODERATOR`
  (`PATCH /api/v1/admin/users/:userId`, body `{ systemRole }`).
- Suspend a user, invalidating all of their sessions
  (`POST /api/v1/admin/users/:userId/suspend`).
- Reactivate a suspended user
  (`POST /api/v1/admin/users/:userId/activate`).

`MODERATOR` keeps its existing (inert-for-administration) meaning; this ADR
does not redefine it. Granting `MODERATOR` through this surface is permitted
but carries no administration power.

### 2. Guard and authorization

The three routes run under `authGuard → tenantGuard → tenantAdminGuard →
rateLimit` (ADR-0041 §3: tenant-wide, no `X-Workspace-ID`). `tenantAdminGuard`
resolves `system_role = 'ADMIN'` from the tenant database; a client-supplied
role is never read and the token carries none. A non-admin receives
`403 ERR_AUTHORIZATION_FAILED`; there is no `404` reinterpretation because
tenant administration is not workspace-scoped and ADR-0008 governs
*resources* of another workspace, not tenant-wide administration.

Each use case re-asserts `assertTenantAdmin` so the rule holds even if a
future route forgets the guard.

### 3. Invariants the use cases enforce

- **Self-modification.** A tenant admin cannot suspend or demote itself
  (`ERR_CANNOT_MODIFY_SELF`). Self-promotion is a no-op in effect but is still
  an audited change; self-demotion of the last administrator is refused.
- **Last administrator.** Demoting, suspending or removing the role of the
  last `ADMIN` is refused (`ERR_LAST_TENANT_ADMIN`, 409). The count is taken
  inside the transaction with the workspace/tenant row locked so two concurrent
  demotions cannot both pass.
- **Anonymous event users.** Users with `provider = 'ANONYMOUS_EVENT'` are
  treated as not found (`ERR_USER_NOT_FOUND`) for role change and
  suspension: they are guests of a single event workspace and are not managed
  through the tenant user surface.
- **No user creation.** There is no `POST /admin/users`. Users appear only
  through OIDC JIT login (ADR-0018) and event join (ADR-0046). Creating an
  account is not an administration act.
- **No deletion/anonymization.** Removing a user is out of scope and needs
  the PII erasure design (F4). Suspension is the available off-switch.

### 4. Session invalidation

`SuspendTenantUserUseCase` stamps `sessionsValidAfter = now()` on the user row
and revokes all of their refresh tokens. `RefreshSessionUseCase` rejects any
refresh whose `rotation.createdAt` is older than `sessionsValidAfter`, so a
suspended user cannot mint a new access token. The current access token
remains valid until its 15-minute expiry; that is the accepted window and is
consistent with ADR-0018. `ActivateTenantUserUseCase` clears
`sessionsValidAfter`; it does not re-issue sessions, the user signs in again
normally.

### 5. Audit

Every role change, suspension and activation appends a row to
`auth.membership_events` (append-only; UPDATE/DELETE revoked in production),
with `actorId`, `targetId`, `action` (`USER_ROLE_CHANGED`,
`USER_SUSPENDED`, `USER_ACTIVATED`), `tenantId` and `requestId`. The audit
record is the institutional memory of who changed whom; it is the reason the
carve-out is acceptable where the bypass (ADR-0049) was not — every change is
attributed to an authenticated tenant `ADMIN` acting on an existing user.

### 6. Ownership

Tenant user role/status management moves from "Neither — ops CLI only" to the
tenant administration surface. It does **not** move workspace membership or
workspace roles: those stay on `/workspace-admin` and remain governed by
ADR-0049 (no tenant bypass). A tenant `ADMIN` who is not an `ACTIVE`
workspace `ADMIN` of a given workspace still cannot touch that workspace's
members, roles, invitations or codes.

## Consequences

### Positive

- An institution can run its own user base: promote, demote, suspend and
  reactivate without operator access, through the same `/admin` surface that
  already lists users.
- The bootstrap and emergency-recovery guarantees of §9 are preserved
  verbatim: no HTTP route creates the first administrator, and a
  locked-out institution is repaired through the CLI.
- Session invalidation is real and immediate for refresh tokens; access tokens
  expire within 15 minutes, consistent with ADR-0018.
- The role model gains no new column, claim, role or guard: `system_role` is
  still read from the tenant database on every request, and the token still
  carries no role.
- Anonymous event users and the last-administrator invariant keep the
  carve-out from becoming an escalation or lockout path.

### Negative / costs

- A tenant administrator can now change `system_role`, which is a
  high-impact action. It is gated by `tenantAdminGuard`, re-asserted in the
  use case, rate-limited per action (`scoped('admin-user')`), and audited;
  there is no finer-grained "can promote but not demote" permission.
- Suspension is not a `status` column on `auth.users` (deferred, per the plan);
  it rides on `sessionsValidAfter`, which also affects token freshness checks.
  A future `status` column would supersede this mechanism and needs its own
  ADR.
- The CLI remains the only door for the first administrator and for recovery;
  an institution that loses all of its administrators is still operator work.
- `MODERATOR` is grantable through this surface but grants no
  administration power; its semantics are unchanged and remain a separate
  decision (plan "Out of scope").

## Links

- `docs/auth-and-tenancy.md` §12 — role model, enforcement matrix, ownership
  matrix (amended by this ADR)
- `docs/components/web-pwa.md` §Administration surfaces (tabbed UX, tenant
  user management)
- `docs/archive/plans/tenant-user-management/v1.md` — T1 (API), T2/T3 (web), T4
  (this ADR)
- `apps/api/src/application/use_cases/UpdateTenantUserSystemRoleUseCase.ts`
- `apps/api/src/application/use_cases/SuspendTenantUserUseCase.ts`
- `apps/api/src/application/use_cases/ActivateTenantUserUseCase.ts`
- `apps/api/src/infrastructure/http/controllers/TenantAdminController.ts`
- `apps/api/src/infrastructure/http/routes.ts` (admin user routes)
- `apps/api/src/domain/ports/IUserRepository.ts`
- `packages/database/src/schema/tenant.auth.schema.ts` — `users.system_role`,
  `users.sessions_valid_after`
