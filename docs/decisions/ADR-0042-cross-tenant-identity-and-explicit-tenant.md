# ADR-0042 — Cross-tenant identity and explicit tenant selection

- Status: proposed
- Date: 2026-10-28
- Related: ADR-0013 (opaque pseudonym), ADR-0041 (tenant/workspace admin)

## Context
The current model resolves tenant implicitly from IdP claims (hd/tid/org). This blocks external collaborators (gmail, social) and multi-tenant users. The invitation only works within the same IdP/tenant.

## Decision
1. **Router DB becomes the identity authority**: enrich `global_identities` (rename/extend to `global_users`) with full identity profile (email, email_verified, full_name, picture, last_login_at). It stores only identity — no workspace or role data.
2. **Tenant is explicit by default**: authentication resolves identity; tenant is resolved from `global_user_tenants` (0 → deny, 1 → auto, N → selector). IdP claims are a hint, not the source of truth.
3. **Global invitations**: a `global_invitations` table in router DB maps token → (tenant, workspace, role, email). Allows inviting any email with any IdP.
4. **Social logins** enabled in Zitadel for external collaborators.
5. **Multiple roles per workspace**: PK becomes `(workspace_id, user_id, role)`; verification uses union of all roles.
6. **Ephemeral workspace codes**: `workspace_join_codes` table with TTL, capacity, auto-approve, revocation.
7. **Workspaces.kind**: EVENT/PUBLIC/PRIVATE. **users.is_anonymous** for guests. **GUEST** role restricted to EVENT workspaces but can create proposals (PENDING).
8. **Alta directa by handle/identity**, not email.
9. **Atomized flows**: split monolithic use cases into small, auditable operations.

## Consequences
- Router DB grows as identity authority; tenant DB stays tenant-specific.
- Tenant selection UI needed for multi-tenant users.
- Invitations work cross-IdP.
- Guests can participate in events but are restricted.
- More tables and use cases, but each is small and testable.