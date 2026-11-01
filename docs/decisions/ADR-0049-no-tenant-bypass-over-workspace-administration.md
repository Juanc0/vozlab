# ADR-0049 — No tenant bypass over workspace administration

- Status: Accepted
- Date: 2026-11-01
- Amends: ADR-0041 §2 (the `workspaceAdminGuard` tenant-`ADMIN` bypass and the
  "path wins over header" rule) and ADR-0048 §3 (break-glass: read-only roster
  plus explicit cross-workspace entry). ADR-0048 §1's "two surfaces, one
  authority each" and §6's role model stand; §4 (creation with
  `initialAdminUserId`) and §5 (event codes) stand. ADR-0041's other clauses
  (§1 two administrators/two scopes, §3 tenant-wide routes, §4 ontology
  provisioning, §5–§8, §9 bootstrap, §10 audit) stand.
- Related: ADR-0008 (a foreign workspace's resource answers 404),
  ADR-0041 (tenant and workspace administration), ADR-0048 (split of the two
  surfaces), `docs/auth-and-tenancy.md` §12 (role model and enforcement
  matrix), `docs/archive/plans/admin-surfaces/v2.md` (execution plan),
  `apps/api/src/application/policies/workspaceAdminPolicy.ts`,
  `apps/api/src/infrastructure/http/middlewares/WorkspaceAdminGuard.ts`,
  `apps/api/src/infrastructure/http/middlewares/TenantAdminGuard.ts`.

## Context

ADR-0041 §2 and ADR-0048 §3 kept a deliberate escape hatch: a tenant
`ADMIN` was authorized on any workspace-scoped administration route without a
membership row, and could let the path workspace id differ from
`X-Workspace-ID`, because "the institution may need its administrator to
repair a workspace whose own administrators are gone." The split was described
as a *surface* contract only — "the API bypass stays," and the UI was "not a
security boundary."

That escape hatch turned out to be the wrong model for VozLab:

1. **It conflated two authorities.** A tenant `ADMIN` is the institution's
   administrator of *existence* — who may create, list and retire workspaces
   and run tenant hygiene. A workspace `ADMIN` is the administrator of
   *belonging* — who may change members, roles, invitations and codes. Letting
   the first silently impersonate the second means a tenant administrator can
   read and rewrite any workspace's membership without ever being recorded as a
   member of it, and without the workspace's own administrators knowing.
2. **It could not be audited as a membership.** `auth.membership_events` is
   append-only and records *who* changed *what* in *which* workspace. A
   cross-workspace write performed through the bypass is attributed to an actor
   who holds no row in that workspace, so the audit trail stops being a record
   of workspace authority and becomes a record of tenant authority acting
   inside workspaces.
3. **The break-glass roster was a second, weaker `/admin`.** Reading a
   workspace's members and pending join requests on `/admin` duplicated the
   workspace surface's read path and made "tenant admin reads anything" look
   like a routine power rather than an emergency one.
4. **The user-facing review (admin-surfaces v2) rejected it.** Tenant and
   workspace administration must not overlap; the tenant admin keeps
   institutional powers and loses every workspace-scoped read and write. The
   emergency door is not a silent API bypass — it is the operator CLI, which
   is already the only door for `system_role` changes (ADR-0041 §9).

The alternatives considered were:

1. **Keep the bypass, gate it behind an explicit "enter workspace
   administration" action.** Rejected: the bypass is still an authorization
   decision made in the guard, and every workspace-scoped route would keep
   carrying a tenant-`ADMIN` branch. The audit and the role model stay split.
2. **A time-limited, audited override grant for tenant admins.** Deferred, not
   scheduled: it is a *new feature*, not a bypass removal, and needs its own
   ADR (scope, expiry, audit shape, who grants). It is listed in the plan's
   "Out of scope".
3. **Remove the bypass entirely and route emergencies through the CLI.**
   Chosen. A workspace is administered only by its `ACTIVE` workspace `ADMIN`s.
   A tenant administrator who needs to repair a workspace with no
   administrators left does so through `db:grant-tenant-admin`-style operator
   tooling against the tenant database, exactly as `system_role` changes are
   already handled — not through the HTTP API.

Forces that constrain the choice:

- The role model stays closed: two administrators, no new column, no new JWT
  claim, no new role. Roles are read from the tenant database on every request
  (ADR-0041 §1) and a token never carries one.
- A resource of another workspace answers 404, never 403 (ADR-0008). Removing
  the bypass makes a tenant administrator without a membership in the target
  workspace fail like any other non-admin — `ERR_UNAUTHORIZED_WORKSPACE_ACCESS`
  (403) on the workspace administration routes, because the absence of an
  `ACTIVE` `ADMIN` membership is a real authorization failure, not a
  non-existence. The 404 rule keeps applying to *resources* (nodes, edges,
  proposals) of another workspace.
- `system_role` stays per institution (ADR-0041 §1, ADR-0031): a global user
  linked to two institutions can be `ADMIN` in one and `USER` in the other.
  There is no platform-wide role and there must not be one.
- Creation-time ownership is not a bypass: `CreateWorkspaceUseCase` still calls
  `assertTenantAdmin` for creation and still bootstraps the creator (or the
  named `initialAdminUserId`) as workspace `ADMIN` in the same transaction
  (ADR-0048 §4). That is a creation act, not an impersonation.

## Decision

### 1. No bypass in the guard

`WorkspaceAdminGuard` no longer special-cases a tenant `ADMIN`. It requires an
`ACTIVE` `ADMIN` membership in the workspace named by `X-Workspace-ID` for
every caller, tenant administrators included. A tenant administrator without
such a membership is rejected with the same error as any other non-admin:
`ERR_UNAUTHORIZED_WORKSPACE_ACCESS` (403). The guard keeps requiring the
header, because the header names the workspace the request acts on.

### 2. No bypass in the policy

`assertWorkspaceAdmin` drops the tenant-admin branch and returns `void`; it
resolves only when the actor holds `ADMIN` in the union of its `ACTIVE`
membership rows. It no longer returns an `{ isTenantAdmin }` flag, and no use
case captures or branches on such a flag (none did; verified in T1/T2). The
tenant scope is still asserted separately, where it belongs, by
`assertTenantAdmin` on `CreateWorkspaceUseCase` and the other tenant-wide use
cases.

### 3. No cross-workspace override

A path workspace id that disagrees with `X-Workspace-ID` is answered `404`
`ERR_WORKSPACE_NOT_FOUND` for every caller, including a tenant administrator.
There is no "path wins over header" rule on the workspace administration
routes any more. The header names the workspace the request acts on; the path
must agree with it or the request is treated as naming a missing resource.

### 4. Break-glass is removed

- The read-only roster of an arbitrary workspace on `/admin` is removed, along
  with the "enter workspace administration" cross-workspace link. A tenant
  administrator manages a workspace only by being one of its workspace
  `ADMIN`s — via bootstrap (`db:grant-tenant-admin`-style seeding) or via
  `initialAdminUserId` at creation (ADR-0048 §4).
- `/admin` renders only: the workspace list (name, slug, kind, member and
  pending counts), the create form (name, slug, description, public, kind,
  initial admin), the tenant user directory (read-only) and the tenant hygiene
  sweep.
- `/workspace-admin` is reachable only with an `ACTIVE` workspace `ADMIN`
  membership in the selected workspace. There is no `?workspaceId` tenant
  override and no break-glass entry. A tenant administrator who is not a member
  sees the localized no-access state and makes no API call.

### 5. The API bypass is gone, not relocated

The guard is the authority, and the UI is not a security boundary — but the
guard no longer carries a tenant-`ADMIN` branch at all, so the UI's
no-access state is the only thing a non-member tenant administrator ever sees.
The institution's last-resort repair path is the operator CLI against the
tenant database, as it already is for `system_role` changes (ADR-0041 §9). A
time-limited, audited override grant, if ever wanted, is a new feature and
needs its own ADR; it is not a bypass removal and is out of scope here.

### 6. Tenant and workspace administration do not overlap

The ownership matrix (auth-and-tenancy.md §12.5) loses the break-glass row
and any "tenant admin can administer an arbitrary workspace" capability:

| Capability | Tenant administration (`/admin`) | Workspace administration (`/workspace-admin`) |
| --- | --- | --- |
| Workspace existence, including workspaces the caller does not belong to | Owns | — |
| Workspace creation, its `kind`, and its first administrator | Owns | — |
| Tenant user directory and the tenant cleanup sweep | Owns | — |
| Workspace profile and settings (`name`, `description`, `isPublic`) | — | Owns |
| Members and roles: add, assign or remove a role, change, suspend, reactivate, remove | — | Owns |
| Join requests: approve, reject | — | Owns |
| Invitations: create, revoke | — | Owns |
| Workspace join codes (`purpose = 'WORKSPACE'`) | — | Owns |
| Event codes (`purpose = 'EVENT'`, for a workspace with `kind = 'EVENT'`) | — | Owns |
| Changing `system_role` | Neither — the ops CLI is the only door (ADR-0041 §9) | — |
| Workspace deletion or archive; moving a member between workspaces | Neither — not built | Neither — not built |

`system_role` management, workspace deletion/archive and anything crossing
tenants are not product concepts on either surface.

## Consequences

### Positive

- The two authorities no longer overlap: a tenant `ADMIN` cannot read or
  write any workspace's membership, roles, invitations or codes unless it is
  an `ACTIVE` workspace `ADMIN` of that workspace.
- The audit trail stays a record of workspace authority: every workspace-scoped
  write is attributed to an actor who holds an `ACTIVE` `ADMIN` row in that
  workspace.
- The guard and the policy each carry one branch instead of two; the
  enforcement matrix no longer has a "tenant `ADMIN` (bypass)" clause.
- `/admin` becomes a tenant-only surface with a single authority, matching
  `/workspace-admin`.
- The emergency path is explicit and auditable: operator tooling against the
  tenant database, the same door already used for `system_role`.

### Negative / costs

- A tenant administrator can no longer repair a workspace whose administrators
  are gone through the HTTP API; that requires operator access to the tenant
  database. This is the intended trade-off, and it matches how `system_role`
  changes are already handled.
- `WorkspaceAdminGuard` and `assertWorkspaceAdmin` tests lose the "tenant ADMIN
  through without membership" case and gain the "tenant ADMIN without
  membership is rejected" case (T1/T2).
- The admin-surfaces v1 docs (ADR-0048 §3, auth-and-tenancy.md §12.6) and the
  web-pwa component doc described the break-glass path; they are amended by
  this ADR and by the T3 web trim.
- A tenant admin who creates a workspace with `initialAdminUserId` cannot open
  that workspace's administration surface unless it is named as an
  administrator or added later by one. That is delegation, not an accident.

## Links

- `docs/auth-and-tenancy.md` §12 — role model, enforcement matrix, ownership
  matrix (updated by this ADR's T4 pass)
- `docs/components/web-pwa.md` §Administration surfaces (updated by T3/T4)
- `docs/archive/plans/admin-surfaces/v2.md` — execution plan (T1–T4)
- `apps/api/src/infrastructure/http/middlewares/WorkspaceAdminGuard.ts`
- `apps/api/src/application/policies/workspaceAdminPolicy.ts`
- `apps/api/src/application/use_cases/CreateWorkspaceUseCase.ts`
- `packages/database/src/schema/tenant.auth.schema.ts` — `workspace_memberships`,
  `users.system_role`
