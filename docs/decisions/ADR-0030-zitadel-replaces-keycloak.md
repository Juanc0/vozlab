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
3. **Setup is scripted and unattended.** `scripts/setup-zitadel.sh` provisions the
   Zitadel project, the OIDC application and the test user so the lab is
   reproducible. See "Bootstrap procedure" below.
4. **Tenant resolution is claim-based, not broker-org-based.** Because multiple tenants
   share one Zitadel instance, `tenants.oidc_tenant_id` stores the IdP claim value
   (`hd` for Google, `tid` for Entra, org ID for Zitadel native), not a Zitadel org ID.
   The `unique` constraint on `oidc_tenant_id` is removed.

## Bootstrap procedure (Zitadel v4.16)

Zitadel v4 removed the anonymous password login on `POST /v2/sessions`; that route
now requires an authenticated caller. The script therefore does **not** log in as
an admin user. Instead:

1. `docker compose --profile idp up -d zitadel-db zitadel` runs
   `start-from-init`. On the first init of an empty database, Zitadel creates the
   machine user `vozlab-bootstrap` with the `IAM_OWNER` role and writes its PAT to
   `/zitadel/bootstrap/admin.pat`. That path is a bind mount to
   `.zitadel-bootstrap/` (gitignored), so the host can read the token
   deterministically. The `login-client` PAT used by the login UI is written next
   to it.
2. `./scripts/setup-zitadel.sh` reads the PAT (or `ZITADEL_ADMIN_PAT`, or a
   `docker cp` fallback for named-volume stacks), calls `GET
   /management/v1/orgs/me` to read the org ID, then creates/reuses the `vozlab`
   project, the `vozlab-api` OIDC app and the `testuser` user. Redirect URIs are
   merged and the client secret is rotated on every run, so the printed values are
   always current. The run is idempotent.
3. The script prints the `OIDC_*` block for `.env` and the SQL that sets
   `tenants.oidc_tenant_id` for the `sabana` tenant to the org ID.

The PAT exists only after the first init of an empty Zitadel database. If the
container is recreated against a populated Zitadel DB, no PAT is written; the
script prints the recovery steps (remove the *Zitadel* data volume, restart, rerun).
Never run `docker compose down -v` at the repo root for this: it would also delete
the VozLab Postgres volume.

### Public demo (zrok)

`ZITADEL_EXTERNALDOMAIN`, `ZITADEL_EXTERNALPORT` and `ZITADEL_EXTERNALSECURE` are
runtime-configurable. Restarting Zitadel with the zrok auth hostname (port `443`,
secure `true`) changes the OIDC issuer and returns `__Host-` secure cookies; no DB
re-init is required. Keep the management URL on localhost while provisioning and
pass the public issuer separately:

```bash
ZITADEL_PUBLIC_URL=https://vozlabauth.share.zrok.io \
API_CALLBACK=https://vozlabdemo.share.zrok.io/api/v1/auth/callback \
WEB_ORIGIN=https://vozlabdemo.share.zrok.io \
./scripts/setup-zitadel.sh
```

See `docs/runbook-demo-zrok.md`.

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
