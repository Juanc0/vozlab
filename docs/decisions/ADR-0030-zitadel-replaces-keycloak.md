# ADR-0030: Zitadel replaces Keycloak as the identity broker

- Status: Accepted
- Date: 2026-10-26
- Supersedes: ADR-0028 §1 (broker choice) and ADR-0029 (broker references)
- Related: ADR-0018 (OIDC login), ADR-0028 (multi-institution identity), ADR-0029 (explicit provider selection)

## Context

ADR-0028 chose a self-hosted Keycloak broker (JVM, ~1–2 GB RAM) for OIDC + SAML 2.0 +
LDAP/AD federation. During implementation we evaluated Zitadel (Go-based, ~128 MB RAM) and
found it covers the same protocols (OIDC, SAML 2.0, LDAP federation via actions) with a
fraction of the operational cost, while keeping the API as a resource server.

Keycloak is retained in `docker/identity-lab/` for SAML/LDAP testing but is no longer
the production broker.

## Decision

1. **Zitadel is the production broker.** It runs under `docker compose --profile idp` on
   `:8081`. The API validates Zitadel-issued tokens against Zitadel's JWKS.
2. **Keycloak moves to the lab only.** `docker/identity-lab/compose.yml` keeps Keycloak
   for SAML/LDAP experiments. It must never be the production broker.
3. **Setup is scripted.** `scripts/setup-zitadel.sh` provisions the Zitadel project,
   application and IdP federation (Google, Entra) so the lab is reproducible.
4. **Tenant resolution is claim-based, not broker-org-based.** Because multiple tenants
   share one Zitadel instance, `tenants.oidc_tenant_id` stores the IdP claim value
   (`hd` for Google, `tid` for Entra, org ID for Zitadel native), not a Zitadel org ID.
   The `unique` constraint on `oidc_tenant_id` is removed.

## Consequences

### Positive

- ~10× lower memory footprint; faster startup; simpler ops.
- Same protocol coverage (OIDC, SAML 2.0).
- Reproducible lab via script.

### Negative / costs

- Zitadel's SAML/LDAP federation is less battle-tested than Keycloak's in some flows.
- Documentation and runbooks that referenced Keycloak as production must be updated
  (knowledge-transfer, AGENTS.md references).
- A migration path exists if Zitadel proves insufficient: Keycloak remains in the lab.

## Links

- `docker-compose.yml` (`--profile idp`)
- `scripts/setup-zitadel.sh`
- `apps/api/src/infrastructure/identity/OidcProviderClient.ts`
- `docs/decisions/ADR-0028-multi-institution-identity-global-index-and-broker.md`
- `docs/decisions/ADR-0029-explicit-provider-selection-and-general-tenant.md`
