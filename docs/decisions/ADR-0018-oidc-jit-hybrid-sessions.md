# ADR-0018: OIDC login, JIT accounts and hybrid access/refresh sessions

- Status: Accepted
- Date: 2026-10-19
- Supersedes: ADR-0014 (real auth endpoints deferred)
- Amends: ADR-0001 (the access transport stays Bearer; the refresh credential is an `HttpOnly` cookie)

## Context

ADR-0014 deferred FR-01/02/03 and made `db:mint-token` the interim credential
source. That left the pseudonym model without a production account lifecycle:
no IdP code exchange, no user upsert, no session revocation and no event-QR
onboarding. Batch 1V closes that gap.

The target deployment uses Microsoft Entra ID or Google Workspace. Both speak
OpenID Connect but expose the tenant differently: Entra puts the directory id in
`tid`; Google Workspace puts the hosted domain in `hd`. The PWA is a
browser-only SvelteKit app; the Python workers will authenticate out of band.
The graph API must stay a resource server: it must not issue IdP tokens or use
asymmetric keys for its own access tokens.

The alternatives considered were:

- **Refresh token as a second JWT.** Simple and stateless, but rotation,
  revocation and reuse detection require a server-side record anyway, and a
  signed refresh token cannot be revoked without a blacklist.
- **Refresh token in JSON, stored by JavaScript.** Consistent with the bearer
  design, but exposes a 30-day credential to XSS. The PWA can keep a 15-minute
  access token in memory; it does not need to persist it.
- **Server-side session id in a cookie.** Correct but requires a session store
  and changes the API from a resource server into a session server.

## Decision

### Authorization-code flow

- `GET /api/v1/auth/login?redirect=/path` generates a CSPRNG `state`, `nonce`
  and PKCE verifier, stores them in Redis under the state key (single-use,
  10-minute TTL), and redirects to the IdP with `response_type=code`,
  `code_challenge_method=S256`, `state` and `nonce`.
- `GET /api/v1/auth/callback?code=&state=` atomically consumes the state
  (`GETDEL`), exchanges the code at the token endpoint with the verifier, and
  validates the ID token with `jose`: signature through the configured JWKS,
  `iss`, `aud`, `exp` and `nonce`. There is no OIDC discovery; `OIDC_ISSUER` and
  `OIDC_JWKS_URL` are explicit configuration.
- `email_verified: false` is rejected. An absent claim is accepted because
  Entra ID does not always emit it; profile claims may be completed from the
  userinfo endpoint when an access token is present.
- Redirect paths are same-origin absolute paths (`/...`, not `//...`, with no
  backslashes or control characters, which URL normalization could turn into a
  different origin); the callback redirects to `WEB_ORIGIN + redirectPath` and
  never puts a token in a URL.

### Tenant and account creation

- The validated tenant key is `tid` (Entra) or `hd` (Google), matched against
  `tenants.oidc_tenant_id`. Unknown → `403 ERR_TENANT_NOT_PROVISIONED`;
  `iss`-based resolution remains unbuilt.
- First login is just-in-time: `auth.users` is created with a random 64-hex
  `author_hash` (ADR-0013). **No workspace membership is created.** Workspace
  routes still require an existing `auth.workspace_memberships` row, so an
  institutional account cannot see a tenant/workspace merely by logging in.
- An existing OIDC account is linked by `(provider, provider_user_id)`;
  otherwise a verified email may link to an existing OIDC account. An
  `ANONYMOUS_EVENT` account is never linked to an institutional login;
  conflicts surface as `409 ERR_ACCOUNT_LINK_CONFLICT`.

### Hybrid session

- **Access token:** HS256 JWT signed with `JWT_SECRET`, 15-minute default
  (`JWT_EXPIRES_IN`), returned in JSON and held in PWA memory. Claims are
  `sub`, `tid`, `jti`, `authorHash`, optional `type`; the API remains the only
  signer and verifier.
- **Refresh token:** opaque `v1.<tenant UUID>.<64 hex random>` in an
  `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production), path
  `/api/v1/auth`, 30-day default (`JWT_REFRESH_EXPIRES_IN`). Only its SHA-256
  hash is stored in `auth.refresh_tokens`.
- Every successful refresh rotates the token: the old row is revoked and a new
  row is inserted in the same family. Presenting an already-revoked token is
  treated as theft and revokes the whole family. The response contains a fresh
  access token and sets the new cookie.
- `POST /api/v1/auth/logout` blacklists the access `jti` for its remaining
  lifetime, revokes the refresh family when the cookie is valid, and clears the
  cookie. Agents (`SYSTEM_AGENT`) never receive refresh sessions and are minted
  out of band.

## Consequences

### Positive

- No password storage, no IdP token accepted by the graph API, and no
  long-lived access token in JavaScript.
- The refresh credential is not readable by JavaScript and is revocable;
  rotation makes silent replay detectable.
- JIT onboarding works for any institution without a manual import, while the
  membership requirement keeps workspace access explicit.
- The PWA can restore a session on page load by calling `/auth/refresh`; no
  token is persisted in `localStorage`.

### Negative / costs

- Two credentials and two storage mechanisms: JSON access token plus cookie.
  The PWA fetch client must send `credentials: 'include'` to auth routes.
- The API is stateful for OIDC state and refresh sessions; Redis and the tenant
  DB must be available at login/refresh time.
- Cookie `SameSite=Lax` requires the PWA and API to be same-site in production.
  A cross-site deployment needs a different CSRF strategy.
- A tenant DB failure during callback/event join can leave a consumed OIDC
  state or event-code slot (event codes: see ADR-0019). There is no
  distributed transaction.
- `tid`/`hd` support covers Entra and Google Workspace only; an IdP that
  identifies tenants solely by `iss` still needs a new resolution rule.
- Account linking by email trusts the IdP's verification; a misconfigured IdP
  could merge identities.

## Links

- `apps/api/src/application/use_cases/StartOidcLoginUseCase.ts`
- `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts`
- `apps/api/src/application/use_cases/RefreshSessionUseCase.ts`
- `apps/api/src/application/use_cases/LogoutUseCase.ts`
- `apps/api/src/infrastructure/identity/OidcProviderClient.ts`
- `apps/api/src/infrastructure/identity/RedisOidcStateStore.ts`
- `apps/api/src/infrastructure/persistence/repositories/DrizzleUserRepository.ts`
- `apps/api/src/infrastructure/persistence/repositories/DrizzleRefreshTokenRepository.ts`
- `packages/database/src/schema/tenant.auth.schema.ts`
- `docs/auth-and-tenancy.md`
- `docs/decisions/ADR-0001-bearer-jwt-auth-transport.md`
- `docs/decisions/ADR-0013-random-opaque-pseudonym.md`
- `docs/decisions/ADR-0014-real-auth-endpoints-deferred.md`
