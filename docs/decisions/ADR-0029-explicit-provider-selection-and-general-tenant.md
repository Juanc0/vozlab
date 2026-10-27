# ADR-0029: Explicit provider selection at the OIDC broker and the "General" tenant

- Status: Accepted (amended by ADR-0030 and ADR-0031)
- Date: 2026-10-26
- Amends: ADR-0018 (OIDC login, JIT accounts and hybrid sessions), ADR-0028
  (multi-institution identity, global index and broker)
- Amended by: ADR-0030 (Zitadel replaces Keycloak), ADR-0031 (tenant from token claims)
- Related: ADR-0008 (cross-workspace 404), ADR-0013 (random opaque pseudonym)

## Context

ADR-0018 makes Keycloak the broker in front of Microsoft Entra ID and Google
Workspace. The lab (`docker/identity-lab/`) exists to prove that Keycloak can
federate a directory (LDAP, SAML 2.0, OIDC) and that the resulting token is
consumed correctly by the API and the PWA.

Two things were left undecided:

1. **Where and when the user picks the identity provider (IdP).** Entra ID,
   Google Workspace, Google consumer and the local directory are all valid
   sources. The product must not guess from the email domain: domain-based
   "home realm discovery" is non-deterministic (a typo or a shared domain
   silently routes to the wrong tenant) and it leaks which institutions exist.
2. **Where users without an institution land.** External / consumer accounts
   (e.g. a personal Gmail) must not fail login and must not be forced into a
   tenant they do not belong to. They land in a single, pre-provisioned
   **General** tenant with no workspace memberships, exactly like an
   institutional JIT account today.

## Alternatives considered

Three options were evaluated. Each is described by the path a request takes
through the components, because the difference is *where the choice is made*.

### Option A — Selection happens inside Keycloak (buttons, no home realm discovery)

The PWA calls `/auth/login` with no hint. Keycloak renders its own login
page with one button per configured IdP ("Sign in with Microsoft", "Sign in
with Google", "Sign in with the local directory"). The user clicks one.
Keycloak then redirects to that IdP.

Path of a request:

1. Browser → PWA: click "Sign in".
2. PWA → API `GET /api/v1/auth/login?redirect=/`: API generates `state`,
   `nonce`, PKCE verifier; stores them in Redis (single-use, 10 min TTL);
   replies `302` to Keycloak with `state` and `code_challenge`.
   *(The API never knows which IdP will be used.)*
3. Browser → Keycloak: Keycloak renders the selector (no auto-redirect).
4. Browser → chosen IdP (Entra / Google / local LDAP): user authenticates.
5. IdP → Browser → Keycloak callback: IdP returns its code to Keycloak.
6. Keycloak → IdP (back-channel): Keycloak exchanges the code for IdP tokens
   and validates them.
7. Keycloak → Browser → API `GET /api/v1/auth/callback?code=&state=`: Keycloak
   issues its own code.
8. API → Redis `GETDEL state`; → Keycloak token endpoint (back-channel);
   validates the Keycloak ID token (JWKS / `iss` / `aud` / `nonce`);
   JIT-upserts `auth.users`; sets the refresh cookie; `302` to the PWA.

Why each component is involved:

- **PWA**: only triggers the flow and receives the final redirect. It never
  sees an IdP URL.
- **API**: owns the VozLab session (access JWT + refresh cookie) and the
  OIDC `state`/PKCE. It trusts Keycloak as the sole issuer of the ID token
  it validates. It does not choose the IdP.
- **Keycloak**: is the broker. It owns the IdP list, the user-facing
  selector and the back-channel exchange with each IdP. It normalises every
  IdP into one OIDC token for the API.
- **IdP**: authenticates the user and asserts identity (`sub`, `email`,
  `email_verified`, and `tid`/`hd` when present).

### Option B — Selection happens in the PWA, enforced by the API via `kc_idp_hint` (chosen)

The PWA renders the provider list itself ("Microsoft (Universidad de la
Sabana)", "Google Workspace", "Cuenta personal (Google)", "Directorio local
(dev)"). On click it calls `GET /api/v1/auth/login?provider=<id>&redirect=/`.
The API validates `<id>` against an allow-list, stores the chosen provider
inside the Redis state, and redirects to Keycloak with
`kc_idp_hint=<id>`. Keycloak skips its own selector and goes straight to
that IdP.

Path of a request (differences from Option A in bold):

1. Browser → PWA: click a specific provider button.
2. **PWA → API `GET /api/v1/auth/login?provider=microsoft&redirect=/`.**
3. **API validates `provider` against the allow-list; rejects unknown values
   with `400 ERR_INVALID_PROVIDER`. Stores `provider` in the Redis state.**
4. API → Redis: `state` (now carrying `provider`) + PKCE, TTL 10 min.
5. API → Browser: `302` to Keycloak with `kc_idp_hint=microsoft`, `state`,
   `code_challenge`.
6. Browser → Keycloak: Keycloak sees the hint and redirects directly to
   Microsoft (no selector rendered).
7. Browser → IdP → ... (steps 4–8 of Option A unchanged).
8. API callback: **reads `provider` from the consumed Redis state and
   records it in the audit log (D11) together with the resulting
   `provider_user_id`.** The IdP is *not* re-derived from the token.

### Option C — Resolution by email domain (rejected)

The user types an email in the PWA; the API looks up the domain in
`router.tenants` / `meta.data_sources` and picks the IdP. **Rejected
explicitly**: it assumes identity from a string, is not deterministic (a
shared or mistyped domain routes to the wrong tenant), and leaks which
institutions are registered. It also breaks for consumer accounts that share
a domain with an institution (e.g. `@gmail.com`).

## Decision

Adopt **Option B**, with two rules:

1. **Explicit, validated selection.** The IdP is chosen by a deliberate
   user action and validated by the API against a closed allow-list before any
   redirect is issued. No home realm discovery, no domain inference, no
   "smart" routing. The allow-list is configuration, not data: adding an IdP
   is a deploy, not a row.
2. **Unknown / consumer identity lands in the General tenant.** When the
   validated token carries no `tid` (or a `tid` that is not provisioned in
   `router.tenants`), the API does not fail the login and does not create a
   workspace membership. Instead it JIT-creates the user under the
   pre-provisioned `General` tenant (a normal tenant row with
   `oidc_tenant_id = 'general'`), with zero memberships, exactly as an
   institutional JIT account is created today. The user can later join a
   workspace through an event code (FR-02) or an invitation (D3/D9).

The `tid` claim remains the source of truth for institutional accounts
(Entra `tid`, Google Workspace `hd` mapped by Keycloak). For consumer
accounts the claim is absent and the General tenant applies.

## Security notes (what a suspicious user / attacker would probe)

- **Open redirect.** `redirect` is already constrained to same-origin
  absolute paths (ADR-0018). `provider` must be validated the same way:
  closed allow-list, no passthrough to Keycloak. An unknown value returns
  `400` and never reaches Keycloak.
- **IdP injection.** If `kc_idp_hint` were built from unvalidated input, an
  attacker could force a login through a weak or attacker-controlled IdP.
  The allow-list in the API is the control; Keycloak must also be configured
  so that only the intended IdPs are enabled for the `vozlab` realm (no
  stray IdPs left over from lab experiments).
- **Phishing of the selector.** The PWA renders the buttons, so a
  compromised PWA could show a fake provider. Mitigations: HTTPS only,
  verified origin, and the final token is still validated by the API against
  Keycloak's JWKS regardless of which button was clicked. The IdP choice is
  audited, not trusted.
- **Confusion of identity.** A user may click "Google" expecting Workspace
  and land in General. Mitigation: button labels must be unambiguous
  ("Google Workspace (institución)" vs. "Cuenta personal de Google"), and
  the General tenant must grant no workspace access by default, so a
  mistaken choice cannot expose data.
- **Token replay / state fixation.** Already covered by ADR-0018: PKCE S256,
  single-use `state` in Redis (`GETDEL`), `nonce` validation. The
  `provider` stored in state is consumed atomically with it, so it cannot be
  swapped mid-flow.
- **Audit.** The chosen provider and the resulting `provider_user_id` are
  recorded in the append-only audit log (D11). A login whose provider does
  not match the account's recorded provider is a signal worth alerting on.
- **Lab hygiene.** The identity lab must never enable an IdP that is not
  also in the production allow-list, or a developer could log in through a
  path that production does not support. The allow-list is the contract
  between lab and production.

## Consequences

### Positive

- Deterministic: the same button always yields the same IdP. No inference,
  no domain tables consulted at login time.
- The API keeps control of the flow and can audit the choice.
- Consumer accounts work without a tenant resolution rule: they land in
  General and use event codes / invitations to join a workspace.
- The lab can add IdPs (LDAP, SAML, Authentik) by adding them to both
  Keycloak and the allow-list, proving the protocol without changing the API.

### Negative / costs

- The PWA must render and maintain the provider list and its i18n labels.
- Adding a new institution's IdP is a deploy (allow-list change), not a
  data operation. This is intentional but slower than a pure data change.
- The General tenant is a real tenant row: it participates in rate limits,
  quotas and (eventually) billing. It must be excluded from institutional
  reports and from any "list of institutions" surface.
- Home realm discovery is unavailable, so a user with many accounts must
  pick explicitly every time. Acceptable: the product values determinism
  over convenience.

## Links

- `apps/api/src/application/use_cases/StartOidcLoginUseCase.ts`
- `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts`
- `apps/api/src/infrastructure/identity/OidcProviderClient.ts`
- `apps/api/src/infrastructure/identity/RedisOidcStateStore.ts`
- `docs/decisions/ADR-0018-oidc-jit-hybrid-sessions.md`
- `docs/decisions/ADR-0028-multi-institution-identity-global-index-and-broker.md`
- `docker/identity-lab/README.md`