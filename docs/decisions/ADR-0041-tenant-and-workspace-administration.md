# ADR-0041 — Tenant and workspace administration (US-00)

- Status: accepted
- Date: 2026-10-28
- Related: ADR-0013 (opaque pseudonym), ADR-0023 (merge verdict not applied),
  ADR-0025 (source resolution), ADR-0026 (proposal contract), ADR-0028 (tenant
  admin role optional)

## Context

US-00 asks for institutional administration of users and workspaces so that
no operator has to touch the database. Two roles already existed in the
schema but were never consulted:

- `auth.users.system_role = 'ADMIN'` (tenant administrator)
- `auth.workspace_memberships.role = 'ADMIN'` (workspace administrator)

The old membership routes were labelled "ADMIN only" but enforced nothing:
any authenticated member could change roles, suspend or expel another member
just by sending their own `X-Workspace-ID`. There was no listing, no
workspace creation and no UI.

## Decision

1. **Two administrators, two scopes.** A tenant `ADMIN`
   (`system_role = 'ADMIN'`) manages every user and every workspace of the
   institution. A workspace `ADMIN` (`workspace_memberships.role = 'ADMIN'`,
   status `ACTIVE`) manages only its own workspace. The role is always read
   from the tenant database on every request, never trusted from the JWT.

2. **A new `workspaceAdminGuard`** replaces `tenantWorkspaceGuard` on the
   administration routes. A tenant ADMIN bypasses the membership check and
   may target a workspace that is not the one its PWA has selected (path
   wins over header). A non-tenant-admin whose path disagrees with the
   header is answered **404**, never 403, so the existence of the other
   workspace is not leaked.

3. **Tenant-wide routes need no `X-Workspace-ID`.** Discovery and join
   requests (`/api/v1/workspace-discovery`, `/api/v1/workspace-join-requests`)
   and `/api/v1/admin/*` are scoped to the tenant: a user who belongs to no
   workspace must still be able to ask to enter one.

4. **Workspace creation provisions the base ontology** (`Problem`, `Idea`,
   `Resource` and the five relations) and makes the creator a workspace ADMIN,
   in one transaction. A workspace without an ontology cannot create a node,
   and a workspace without an administrator has no way back in.

5. **Workspace codes route, never grant.** `auth.workspaces.join_code` is a
   random, rotatable routing hint. A user who holds it can only create a
   `PENDING` join request; approval is a separate administrative act. Public
   workspaces are discoverable without a code.

6. **Join requests are hints, not grants.** `auth.workspace_join_requests`
   has a partial unique index for one `PENDING` request per user/workspace.
   Approving flips the request and creates the membership in the same
   transaction; approving twice is a conflict.

7. **At least one active workspace ADMIN is always kept.** Demoting,
   suspending or removing the last one is refused; self-suspension and
   self-removal are refused. The workspace row is locked first so two
   concurrent demotions cannot both pass the count.

8. **Invitations are hardened, email-bound links.** `maxUses = 1`, 72-hour
   TTL, revocation of the previous pending invitation for the same email,
   admin-only creation, and a strict redemption that throws
   `ERR_INVITATION_INVALID` when the token is missing, used, expired or
   bound to a different/unverified email. Only the hash of the token is
   stored; the raw token exists once, in the answer. A user who has never
   signed in is onboarded through this link rather than through direct add
   (which needs an `auth.users` row).

9. **Bootstrap.** The first tenant administrator is created by
   `db:grant-tenant-admin` (operator tool) and the dev seed sets the
   maintainer's `system_role = 'ADMIN'`. A CLI is the only door, never the
   API.

10. **Audit.** Every administrative change appends a row to
    `auth.membership_events` (append-only; UPDATE/DELETE are revoked in
    production).

## Consequences

- The membership routes are no longer open to any member: they require an
  `ADMIN` role resolved from the database.
- A workspace created from the administration screen is immediately usable;
  no hand-written SQL is needed.
- The invitation link is the only place a raw token leaves the system. Its
  blast radius is bounded by single-use, short TTL, email binding and
  revocation; a leaked link cannot be replayed or escalated.
- The join-code flow remains available for users who prefer not to use an
  invitation, at the cost of requiring an administrator to approve.
- Web UI, SSE and the Consolidator are out of scope for this delivery.
