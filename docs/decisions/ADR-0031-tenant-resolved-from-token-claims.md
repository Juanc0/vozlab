# ADR-0031: Tenant is resolved from token claims, not from user input

- Status: Accepted
- Date: 2026-10-26
- Amends: ADR-0029 (Option B, `institution` parameter)
- Related: ADR-0018, ADR-0028, ADR-0029, ADR-0030

## Context

ADR-0029 (Option B) proposed that the PWA passes an `institution` slug to
`GET /api/v1/auth/login`, stored in Redis state and verified on callback as
`ERR_TENANT_MISMATCH`. During implementation we realised the user never chooses
the institution: they choose the **authentication provider** (Google, Entra,
local). The institution is determined by the IdP's token claims:

- Google Workspace: `hd` (hosted domain)
- Microsoft Entra: `tid` (tenant/directory ID)
- Zitadel native: org ID (resource owner)

Letting the user (or the PWA) name the institution would re-introduce the
non-deterministic routing ADR-0029 explicitly rejected (domain inference).

## Decision

1. **The login flow carries only `kc_idp_hint`**, never an institution slug.
   `StartOidcLoginUseCase` accepts `redirectPath`, `kcIdpHint` and
   `invitationToken`.
2. **Tenant resolution happens in `CompleteOidcLoginUseCase`** from
   `identity.tenantKey`, looked up via `routerDb.findTenantByOidcId(...)`.
   If no tenant matches, the login fails with `ERR_TENANT_NOT_PROVISIONED`.
3. **Priority in `OidcProviderClient`**: `hd` > `tid` > Zitadel org ID.
4. **Dev tokens** use the internal tenant UUID (`tid` claim) so `TenantGuard`
   (which resolves by `oidc_tenant_id`) and tests stay consistent. Wait —
   actually `TenantGuard` resolves by `oidc_tenant_id` from the JWT `tid`,
   and dev tokens now carry the internal UUID which is also stored as
   `oidc_tenant_id` for the `sabana`/`local` tenants. For institutional
   tenants the JWT `tid` would carry `hd`/`tid` values; dev tokens use the
   `sabana` sentinel.

   Correction: dev tokens carry `OIDC_TENANT_ID` (= `sabana`) so they resolve
   to the `sabana` tenant, matching the seeded data.

5. **The `institution` query parameter and `ERR_TENANT_MISMATCH` code are
   removed** from the login flow.

## Consequences

### Positive

- No user-driven institution selection; routing is deterministic from IdP claims.
- Simpler login API (one less parameter).
- Aligns with ADR-0029's core principle: no home realm discovery.

### Negative / costs

- A user whose IdP claim does not match any provisioned tenant cannot log in.
  Provisioning a tenant requires adding a row with the correct `oidc_tenant_id`.
- Dev tokens must use a value that maps to a seeded tenant (`sabana`).

## Links

- `apps/api/src/application/use_cases/StartOidcLoginUseCase.ts`
- `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts`
- `apps/api/src/infrastructure/identity/OidcProviderClient.ts`
- `apps/web/src/routes/(auth)/login/+page.svelte`
