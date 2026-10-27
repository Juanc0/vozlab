# ADR-0028: Multi-institution identity, global index and external broker

- Status: Accepted (broker choice amended by ADR-0030)
- Date: 2026-10-24
- Supersedes: the deferred cross-institution identity entry (D-23 in `knowledge-transfer/15-decision-register-and-roadmap.md`), subject to the conditions in §Consequences.
- Amended by: ADR-0030 (Zitadel replaces Keycloak)

## Context

VozLab is multi-tenant: one physical database per tenant, memberships in `auth.workspace_memberships`,
JIT accounts created at login with no implicit workspace access (ADR-0018). Today the API assumes a
single OIDC issuer (`OIDC_ISSUER`), links accounts by `(provider, sub)` and, failing that, by email
(`DrizzleUserRepository.findOrCreateOidcUser`), and has no membership-management route (F-02).

Three new requirements force a change:

1. **Cross-institution membership.** A person must enter several institutions with the same access
   identity (a university account or a personal Google/Microsoft account). External collaborators
   need their own non-university accounts and may interact with multiple institutions.
2. **Multi-provider login.** The university may use Entra ID, Google Workspace, SAML (RENATA/eduGAIN)
   or a local AD. The API cannot implement SAML or LDAP by hand.
3. **Invitations.** An institution must be able to add members directly (admin role) without
   enumerating IdP users, and an invitation must grant access in both the global and the tenant index.

The previous recommendation (M1, "no global index", ADR-0002 spirit) is superseded: a minimal
global index is needed to recognise the same person across institutions and to support invitations.

## Decision

### 1. Broker is external to the API

The API stays a **resource server**: it validates the VozLab token and decides permissions. Identity
normalisation lives in a self-hosted **Keycloak** broker (OIDC + SAML 2.0 + LDAP/AD federation).
A module inside the API is acceptable only for one or two OIDC providers without SAML or LDAP;
a self-written microservice only moves the same complexity. Keycloak runs in the same `docker compose`
but remains a separate service.

### 2. Global index in the router (M2a always, M2b with membership)

The router database stores two tables:

- `global_identities (id, issuer, subject, created_at, last_seen_at)` with `UNIQUE (issuer, subject)`.
- `global_identity_tenants (global_identity_id, tenant_id, tenant_user_id, status, first_seen_at, last_seen_at)`
  with `UNIQUE (global_identity_id, tenant_id)` and `UNIQUE (tenant_id, tenant_user_id)`.
  `status` is tenant-level (`ACTIVE | SUSPENDED | LEFT`), derived from workspace memberships.

Each tenant stores `auth.users.global_identity_id uuid` (nullable, unique partial index) and keeps
`auth.external_identities (issuer, subject)` as the per-tenant source of the pair. The workspace
permission index stays `UNIQUE (workspace_id, user_id)`; the pair is used only for login and linking,
never for authorization or authorship (`author_hash` remains per-institution, ADR-0013).

The broker is the stable issuer: `issuer` is the Keycloak realm, not the origin provider (Google,
Microsoft, university). The origin provider is kept in the `idp` claim only.

### 3. Invitations and direct add

- IdP user enumeration is not available via OIDC/SAML. Direct add works only for identities already
  known in the global index.
- New people receive an invitation (email-verified by default, plus a code fallback) and redeem it
  on first login. The invitation reserves the local place; the global place is created at login.
- `ADMIN` of a workspace manages memberships. A tenant-level `USER_ADMIN` role is optional (pilot:
  `ADMIN` is enough).
- Direct add creates the local row with `status = 'INVITED'` (no access until redemption).

### 4. Audit

Two append-only tables, no PII, no cascade:

- `auth.membership_events` (per tenant): `workspace_id`, `user_id` (nullable), `invitation_id`
  (nullable), `actor_type`, `actor_id` (nullable), `action`, `before_role`, `after_role`, `reason`,
  `request_id`, `created_at`.
- `global_identity_events` (router): `global_identity_id`, `tenant_id` (nullable), `actor_type`,
  `actor_id` (nullable), `action`, `metadata` (JSONB, IDs and states only), `request_id`,
  `created_at`.

Retention: 1 year in the institution, 2 years in the router (proposed, to be confirmed with legal).
No hash chain in the pilot (restricted role + backups is enough).

### 5. SAML

Only SAML 2.0 is supported. SAML 1.1 is legacy and is not implemented by Keycloak or Zitadel; a
Zitadel metadata document may advertise 1.1 for compatibility, but no functional flow is supported.

### 6. Local lab

Keycloak (OIDC + SAML 2.0) + LLDAP (LDAP only) for the first day; Authentik if a single tool for
OIDC + SAML + LDAP is preferred; Samba AD DC only when real AD is needed; mock-oauth2-server in CI
(OIDC only, does not replace the broker).

## Consequences

### Positive

- Recognises the same person across institutions and providers without storing email globally.
- Invitations and direct add work without IdP user enumeration.
- Protocol complexity (SAML, LDAP, account linking, MFA) is isolated in a tested product.
- Audit trail for membership and global-identity changes, with no PII.

### Negative / costs

- A second service to operate (Keycloak) with its own database, TLS, patches and backups.
- The global index is a cross-tenant correlation point: it requires finality, restricted access,
  retention and (for M2b) a privacy evaluation before production.
- Two physical databases mean no distributed transaction: invitation redemption is an idempotent
  saga with reconciliation.
- M2b reveals institutional affiliation, which can be sensitive.
- Legal basis, consent/notice and retention must be defined with the institution; this ADR records
  the engineering decision, not legal advice.

### Conditions on superseding D-23

D-23 recommended deferring cross-institution identity. This ADR supersedes it only if: finality and
retention are documented, access to the router index is restricted and audited, and (for M2b) a
privacy evaluation is recorded. If those conditions are not met, D-23's defer stands.

## Links

- `knowledge-transfer/guia-identidad-ia/01-explicacion-logins-y-ia.md` (sections 6 to 9, 11, 13)
- `knowledge-transfer/guia-identidad-ia/02-tareas-para-modelo-pequeno.md` (blocks A, B, C, D, F1, F4)
- `knowledge-transfer/guia-identidad-ia/login-tasks/` (atomic tasks)
- `docs/decisions/ADR-0002-two-physical-databases.md`
- `docs/decisions/ADR-0013-random-opaque-pseudonym.md`
- `docs/decisions/ADR-0018-oidc-jit-hybrid-sessions.md`
- `packages/database/src/schema/router.schema.ts`
- `packages/database/src/schema/tenant.auth.schema.ts`