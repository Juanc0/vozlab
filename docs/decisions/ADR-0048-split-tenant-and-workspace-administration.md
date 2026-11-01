# ADR-0048: Tenant administration and workspace administration are two surfaces

- Status: Accepted
- Date: 2026-11-01
- Amends: ADR-0041 §4 (workspace creation may name its first workspace
  administrator; every other clause stands, as already amended by ADR-0045/0046)
- Related: ADR-0008 (a foreign workspace's resource answers 404), ADR-0045
  (workspace join codes and invitations), ADR-0046 (event-code routing),
  `docs/auth-and-tenancy.md` §12 (the normative role model),
  `docs/archive/plans/admin-surfaces/v1.md` (execution plan, archived on closure)

## Context

ADR-0041 gave VozLab two administrators: a **tenant administrator**
(`auth.users.system_role = 'ADMIN'`, appointed by the ops CLI) who may act on
every user and workspace of the tenant, and a **workspace administrator**
(`auth.workspace_memberships.role = 'ADMIN'` with `status = 'ACTIVE'`) who may
act only inside the workspace where the row exists. The API already separates
the scopes with two guards: `tenantAdminGuard`, which needs no workspace
header, and `workspaceAdminGuard`, which is scoped by one.

The UI did not follow. `/admin` is a single page that renders both scopes. Its
first call (`GET /api/v1/admin/workspaces`) is tenant-only, so a workspace
administrator with `system_role = 'USER'` opens the page and receives
`403 ERR_AUTHORIZATION_FAILED` as navigation. A tenant administrator, in the
same page, sees member, role, invitation and code controls for a workspace it
may not belong to, and reads them as tenant powers. Two authorities with
different failure modes share one route, and every control on it belongs to one
of them.

The alternatives considered were:

1. **One page, gate every control by role.** No new route, but the page still
   opens as a 403 for one of its two audiences, and every future control has to
   remember which authority it answers to. Rejected.
2. **One page with a mode switch (`?scope=tenant|workspace`).** One URL, two
   audiences, one gate that must first decide the mode; bookmarks, deep links
   and E2E journeys become ambiguous. Rejected.
3. **Two routes, each with its own gate, plus a break-glass entry for the
   tenant administrator.** Chosen.
4. **A global console over every tenant.** Not a product concept: the platform
   is institution-scoped (ADR-0002, ADR-0031), there is no platform-wide role,
   and there must not be one. Rejected.

Forces that constrain the choice:

- The administration role model is closed: two administrators, no new column,
  no new JWT claim. Roles are read from the tenant database on every request
  (ADR-0041 §1) and a token never carries one.
- `system_role` is per institution, not per platform: it is a column of
  `auth.users` in that tenant's physical database. A user linked to two
  institutions can be `ADMIN` in one and `USER` in the other.
- A resource of another workspace answers 404, never 403 (ADR-0008). A
  wrong-role *surface* is a different thing: it is not a resource, and it may
  answer with a localized no-access state.
- A tenant administrator is the last resort of the institution: it must be able
  to see and repair any workspace, including one whose own administrators are
  gone.

## Decision

### 1. Two surfaces, one authority each

- `/admin` — **tenant administration**. Requires `system_role = 'ADMIN'`,
  resolved from the tenant database. No `X-Workspace-ID` is needed to read or
  write tenant-wide data.
- `/workspace-admin` — **workspace administration**. Requires an `ACTIVE`
  `ADMIN` membership in the workspace the surface acts on, or a tenant `ADMIN`
  entering it explicitly (§3).

Each gate is evaluated before any API call. A signed-in user who lacks the role
sees a localized no-access state; a surface never uses an API 403 as
navigation. Graph, proposals and discussions keep the weaker gate they already
have: the existence of an `ACTIVE` membership of any role.

### 2. Ownership matrix

| Capability | `/admin` (tenant) | `/workspace-admin` (workspace) | API |
| --- | --- | --- | --- |
| Workspace existence, incl. workspaces the caller does not belong to | **Owns** | — | `GET /api/v1/admin/workspaces` |
| Workspace creation and its `kind` (`PRIVATE`/`PUBLIC`/`EVENT`) | **Owns** | — | `POST /api/v1/admin/workspaces` |
| The first workspace administrator | **Owns** (names it, §4) | — | `POST /api/v1/admin/workspaces` (`initialAdminUserId`) |
| Tenant user directory | **Owns** | — | `GET /api/v1/admin/users` |
| Tenant cleanup sweep | **Owns** | — | `POST /api/v1/admin/cleanup` |
| Break-glass: read-only roster of any workspace, and the explicit entry into it (§3) | **Owns** | — (receives the entry) | `GET /api/v1/workspaces/:workspaceId/members`, `GET /api/v1/workspaces/:workspaceId/join-requests` |
| Workspace profile and settings (`name`, `description`, `isPublic`) | — | **Owns** | `GET`/`PATCH /api/v1/workspaces/:workspaceId` |
| Members and roles (add, assign/remove a role, change, suspend, reactivate, remove) | — | **Owns** | `/api/v1/workspaces/:workspaceId/members…` |
| Join requests (approve/reject) | — | **Owns** | `/api/v1/workspaces/:workspaceId/join-requests…` |
| Invitations (create/revoke) | — | **Owns** | `/api/v1/workspaces/:workspaceId/invitations`, `DELETE /api/v1/invitations/:invitationId` |
| Workspace join codes (`purpose = 'WORKSPACE'`) | — | **Owns** | `/api/v1/workspaces/:workspaceId/join-codes…` |
| Event codes (`purpose = 'EVENT'`, `kind = 'EVENT'` only) | — | **Owns** (§5) | the same join-code routes, filtered by `purpose` |
| `system_role` changes | Neither — ops CLI only (ADR-0041 §9) | — | — |
| Workspace deletion or archive | Neither — not built | — | — |
| Anything crossing tenants | Neither — not a product concept | — | — |

### 3. Break-glass is a read-only roster plus an explicit entry

A tenant administrator may, from `/admin`, select any workspace of the tenant —
including one it does not belong to — and read its roster. That roster is
**read-only**: no member, role, invitation, join-code or event-code control
lives on `/admin` from T5 on; as of 2026-11-01 the mixed `/admin` page still
ships those controls. To edit, the administrator uses an explicit "enter workspace
administration" action that opens `/workspace-admin` for that workspace. The
target workspace travels explicitly with the entry; the PWA's per-tab workspace
selection is not mutated by it.

The API bypass stays (ADR-0041 §2): a tenant `ADMIN` is authorized on any
workspace-scoped administration route regardless of membership, and a path
workspace id may differ from `X-Workspace-ID` because the screen is
tenant-wide. The split is a surface contract, not a reduction of API
authority — an institution may need its administrator to repair a workspace
whose own administrators are gone. What changes is that the surface no longer
*offers* cross-workspace edits as the routine path.

### 4. Creation may name the first workspace administrator (amends ADR-0041 §4)

`POST /api/v1/admin/workspaces` accepts an optional `kind`
(`PRIVATE`/`PUBLIC`/`EVENT`, default `PRIVATE`) and an optional
`initialAdminUserId`.

- With `initialAdminUserId`: the single creation transaction still provisions
  the workspace, its base ontology and its default join code, and adds an
  `ACTIVE` `ADMIN` membership **for that tenant user**. The creator receives
  **no** membership.
- Without it: the creator keeps the current `ADMIN` membership.
- An unknown user is `ERR_USER_NOT_FOUND` (404); an `ANONYMOUS_EVENT` target is
  `ERR_VALIDATION_FAILED` (422).

ADR-0041 §4's invariant — a workspace is never left without an administrator —
is preserved: it is created *with* an administrator, possibly a different one.
The rest of §4 (base ontology in the same transaction) is unchanged. T5 of the
execution plan implements this route contract; as of 2026-11-01 the schema in
the repository accepts neither field, and T5 supersedes this paragraph.

### 5. Event codes belong to the EVENT workspace administrator

`auth.workspace_join_codes.purpose = 'EVENT'` is the credential an anonymous
attendee redeems (ADR-0046). Its management surface is the **Event codes**
section of `/workspace-admin`, rendered only when the workspace is
`kind = 'EVENT'`. The workspace administrator creates, lists and revokes event
codes through the join-code routes, with `purpose` part of the create and list
contract. `EVENT` is rejected unless the workspace is `kind = 'EVENT'`, forces
`auto_approve = true`, writes the tenant row first and then the idempotent
`router.credential_routes` row (kind `EVENT`) so the pre-tenant join path
resolves.

The operator CLI (`db:event-code`) stays as the ops and break-glass path for a
tenant whose workspace cannot be reached through the API. `/admin` offers no
event-code control, and the legacy
`POST /api/v1/workspaces/:workspaceId/join-code/rotate` is not exposed by
either surface. T8 of the execution plan implements the `purpose` part of the
contract; as of 2026-11-01 the create route in the repository stores the column
default (`WORKSPACE`), and the list route returns every purpose, and T8
supersedes this paragraph.

### 6. The role model does not change

No new role, no new column, no new claim. `auth.workspace_memberships` keeps
`status` (`INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`) and its
`UNIQUE(workspace_id, user_id, role)`: a user may hold several role rows in one
workspace, authorization reads the **union of the `ACTIVE` rows**, and the PWA
displays the **strongest** one (`ADMIN` > `MODERATOR` > `MEMBER` > `GUEST`) of
the active workspace. `MODERATOR` gains no administration meaning here; it
stays inert for administration. `system_role` remains per tenant database.

### 7. Non-goals

Workspace deletion or archive, moving a member between workspaces, a UI for
`system_role` changes (the CLI stays the only door), a database `CHECK` on
`workspaces.kind`, an audit-log UI, and a global multi-tenant console.

## Consequences

### Positive

- Each surface has one authority, so the gate can be decided before any request
  and a wrong-role visit becomes a localized state instead of a raw 403.
- A tenant administrator can create a workspace without joining it and hand it
  to its first administrator, keeping its own membership list clean.
- Event codes are managed next to the workspace they belong to, by the role
  that already manages that workspace.
- The tenant surface no longer depends on a workspace membership: a tenant
  administrator whose memberships were removed can still administer.
- No migration, no new claim, no change to the existing seeds or tokens.

### Negative / costs

- Two surfaces and two gates must stay aligned, and the navigation has to
  render both entries for a user holding both roles without implying they are
  the same power.
- Break-glass is an extra hop for a routine-looking repair, and it only
  *reads* the roster on `/admin`; a write always happens inside the workspace
  surface.
- The API bypass remains: a tenant administrator's token can still edit any
  workspace. The UI is not a security boundary and cannot become one; the guard
  is. Accepted, because the institution's administrator is the last resort.
- `initialAdminUserId` can produce a workspace its creator cannot open without
  break-glass. That is the point of delegation, not an accident.
- Two paths to an `EVENT` credential (the API surface and the CLI) must keep
  identical semantics — purpose, mandatory `auto_approve`, tenant-first then
  idempotent route. Both need tests.
- The active role is read from `/auth/me` and the guards; a demotion is visible
  on the next navigation, not instantly on a screen already open.

## Links

- `docs/auth-and-tenancy.md` §12 — role model, enforcement matrix, surface and
  navigation mapping
- `docs/domain-model.md` §3.1 — membership `status`, the multi-row union and
  the unique key
- `docs/archive/plans/admin-surfaces/v1.md` — the execution plan (T2–T9, archived on closure)
- `docs/decisions/ADR-0041-tenant-and-workspace-administration.md` — the
  decision this record completes
- `apps/api/src/application/policies/workspaceAdminPolicy.ts` —
  `assertTenantAdmin`, `assertWorkspaceAdmin`
- `apps/api/src/infrastructure/http/middlewares/TenantAdminGuard.ts`,
  `WorkspaceAdminGuard.ts`
- `apps/api/src/application/use_cases/CreateWorkspaceUseCase.ts`
- `packages/database/src/schema/tenant.auth.schema.ts` — `workspace_memberships`
  (`role`, `status`), `users.system_role`
