# Authentication and tenancy

VozLab separates three questions:

1. **Who is calling?** — authentication through an institutional OIDC provider
   (FR-01), or an anonymous event code (FR-03).
2. **Which institution's database?** — tenant resolution from the validated
   ID-token claim through the router DB (FR-02).
3. **Which slice of that database?** — workspace isolation from
   `X-Workspace-ID` plus a membership row (FR-05).

## 1. Current auth flow

| Concern | Implementation (2026-10-19) |
| --- | --- |
| Browser login | `GET /api/v1/auth/login?redirect=/path` → 302 to the IdP |
| Callback | `GET /api/v1/auth/callback?code=&state=` → ID-token validation, JIT user upsert, 302 to the PWA |
| Access token | HS256 JWT, 15 min default, returned in JSON; the future PWA holds it in memory |
| Refresh token | Opaque `v1.<tenant UUID>.<64 hex>`, 30 d default, `HttpOnly` cookie, rotated on every use |
| Refresh storage | `auth.refresh_tokens` (tenant DB): SHA-256 hash, family id, expiry, revocation timestamp |
| Logout | `POST /api/v1/auth/logout` (Bearer + cookie): blacklist `jti`, revoke the refresh family, clear the cookie |
| Session probe | `GET /api/v1/auth/me` (Bearer, no `X-Workspace-ID`): profile plus workspace memberships |
| Event join | `POST /api/v1/auth/event-join { code, alias? }`: anonymous user + membership + session |
| Dev credentials | `db:mint-token` remains for local development and workers; it is not exposed over HTTP |

The API is a **resource server**, not an identity provider. It never accepts an
IdP access token as a graph credential; it exchanges the authorization code,
validates the ID token, and issues its own short-lived JWT.

### Login sequence

```text
PWA            API                         Redis              IdP
 |  GET /auth/login?redirect=/x  |           |                 |
 |----------------------------->|  save state/nonce/verifier (10 min) ->|
 |  302 to authorization URL    |           |                 |
 |<-----------------------------|           |                 |
 |  GET callback?code&state ------------------------------------->|
 |                              |  GETDEL state --------------->|
 |                              |  POST token (code + verifier) ->|
 |                              |  verify ID token via JWKS <----|
 |                              |  upsert user + refresh row     |
 |  302 WEB_ORIGIN/x + Set-Cookie: vozlab_refresh               |
 |<-----------------------------|           |                 |
 |  POST /auth/refresh (cookie) |           |                 |
 |----------------------------->|  rotate hash, issue 15 min JWT |
 |  200 { accessToken, user }   |           |                 |
 |<-----------------------------|           |                 |
```

The access token is never placed in a URL. The refresh cookie is scoped to
`/api/v1/auth`, so graph requests are not exposed to automatic cookie replay.

## 2. Access-token contract

| Claim | Required | Enforced by `AuthGuard` | Meaning |
| --- | --- | --- | --- |
| `sub` | Yes | Yes — missing → `401 ERR_INVALID_TOKEN` | Internal `auth.users.id` UUID. Membership is resolved by this value, so it must be the VozLab user id, not a raw IdP subject. |
| `tid` | Yes in practice | Indirectly — missing → `403` in `tenantGuard` | OIDC tenant identifier matched against `tenants.oidc_tenant_id`. `iss` is not consulted. |
| `jti` | Yes by contract | Only when present | Unique token id / Redis blacklist key. Tokens issued by the auth flow always carry one. |
| `authorHash` | Yes | Yes — must match `^[a-fA-F0-9]{64}$`, else `401 ERR_INVALID_TOKEN` | Opaque pseudonym stored on `auth.users.author_hash`; generated randomly on first account creation. Never derived by the API. |
| `type` | Only for agents | Yes | One of `AGENT_EXTRACTOR`, `AGENT_RELACIONADOR`, `AGENT_CONSOLIDADOR`, `AGENT_EMBEDDER`. Any other value → `401 ERR_INVALID_TOKEN`. Absent = human. |
| `iat`, `exp` | Standard | `exp` verified by `jsonwebtoken` | Expired → `401 ERR_TOKEN_EXPIRED`; default lifetime 15 min. |

The API signs and verifies its own HS256 token with `JWT_SECRET`; the IdP's
asymmetric keys are used only for the ID token (JWKS). The PWA obtains a new
access token with `/auth/refresh` rather than persisting the old one.

## 3. Guard chains

Public auth endpoints have **no** `Authorization` or `X-Workspace-ID`; they are
rate-limited per IP and then handled directly:

| Route | Pre-handlers |
| --- | --- |
| `GET /auth/login`, `GET /auth/callback` | public IP rate limit |
| `POST /auth/refresh`, `POST /auth/event-join` | public IP rate limit |
| `POST /auth/logout` | `authGuard` |
| `GET /auth/me` | `authGuard` → `tenantGuard` |

Every tenant-scoped `/api/v1/*` resource route uses:

```text
Authorization: Bearer <jwt>
  -> authGuard
  -> tenantGuard
  -> tenantWorkspaceGuard
  -> rateLimit
  -> controller / use case
```

| Guard | What it checks | Failure |
| --- | --- | --- |
| `authGuard` | Header shape; HS256 signature/expiry; `jti` blacklist; `sub` and 64-hex `authorHash`; `type` allowlist | `401 ERR_INVALID_TOKEN`, `401 ERR_TOKEN_EXPIRED`, `401 ERR_TOKEN_BLACKLISTED` |
| `tenantGuard` | `tid` present; tenant resolves through the router DB | `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`, `403 ERR_TENANT_NOT_PROVISIONED`, `503 ERR_DATABASE_CONNECTION_FAILED` |
| `tenantWorkspaceGuard` | `X-Workspace-ID` present and UUID; membership in the tenant DB (humans only) | `400 ERR_MISSING_WORKSPACE_HEADER`, `400 ERR_INVALID_WORKSPACE_HEADER`, `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`, `503 ERR_DATABASE_CONNECTION_FAILED` |
| `rateLimit` | Per-actor and per-workspace fixed windows in Redis | `429 ERR_RATE_LIMIT_EXCEEDED` |

`authGuard` runs first so no unauthenticated request can reach tenant
resolution. `tenantGuard` is extracted from the workspace guard because
`/auth/me` needs a tenant DB but no workspace header. Rate limiting is
fail-open: a Redis outage logs a warning and allows the request. Reads default
to 300 req/min, writes to 30 req/min, and the workspace ceiling is the
per-actor max × `RATE_LIMIT_WORKSPACE_MULTIPLIER` (default 10).

## 4. OIDC validation

The adapter (`OidcProviderClient`) uses `jose` with an explicit issuer and JWKS
URL; there is no discovery request.

- Authorization request: `response_type=code`, `scope=openid profile email`
  (configurable), `state` (32 random bytes), `nonce` (16 bytes), PKCE S256.
- State, nonce and verifier are stored in Redis under
  `vozlab:oidc:state:<state>` for 10 minutes and consumed with `GETDEL`, so a
  replayed callback cannot succeed.
- Token exchange: `grant_type=authorization_code` with the verifier and client
  secret; token/userinfo calls have 10 s / 5 s timeouts.
- ID-token checks: signature via JWKS, `iss`, `aud`, `exp` (30 s clock
  tolerance), `nonce`, and `email_verified !== false`.
- Profile claims may be filled from userinfo when the ID token omits email or
  name. A userinfo `sub` mismatch is ignored rather than trusted.
- A transport failure is `503 ERR_OIDC_UNAVAILABLE`; a rejected/malformed token
  is `502 ERR_OIDC_EXCHANGE_FAILED`; an explicitly unverified email is
  `403 ERR_EMAIL_NOT_VERIFIED`.

The validated tenant key is `tid` (Entra ID directory id) or `hd` (Google
Workspace domain); either must match `tenants.oidc_tenant_id`. `iss`-based
tenant resolution is still not implemented.

## 5. Tenant resolution and database pools

1. `authGuard` attaches `req.oidcTenantId = payload.tid`.
2. The callback/login use case has already resolved the validated `tid`/`hd`
   to a router tenant; resource requests use `tenantGuard` →
   `routerDb.findTenantByOidcId(tid)`.
3. `tenantGuard` returns the internal tenant UUID and slug; unknown id → `403
   ERR_TENANT_NOT_PROVISIONED`.
4. `ConnectionPoolManager` resolves `tenant_connections` by that UUID and caches
   a Drizzle pool per `tid`.
5. Repositories receive only the internal `tid`; the OIDC string never reaches
   the tenant DB. Event joins resolve the internal UUID from
   `router.event_codes` instead.

The dev seed provisions `tid = sabana`, tenant UUID
`11111111-1111-4111-8111-111111111111`, workspace UUID
`33333333-3333-4333-8333-333333333333`, the router DB `vozlab_router`, and the
tenant DB `vozlab_tenant_dev`.

A missing `tenant_connections` row is a configuration error (`403`); a
driver/connection failure is infrastructure (`503`). The router client preserves
that distinction.

## 6. JIT accounts and workspace access

- First OIDC login creates `auth.users` with `provider =
  OIDC_INSTITUTIONAL`, the IdP `sub` as `provider_user_id`, and a random 64-hex
  `author_hash`. The row is needed before a token can carry `sub` and
  `authorHash`.
- **JIT does not grant workspace access.** No `workspace_memberships` row is
  created; protected workspace routes still return `403
  ERR_UNAUTHORIZED_WORKSPACE_ACCESS` until an administrator adds one.
  `GET /auth/me` returns an empty `workspaces` list in that state.
- Existing OIDC users are matched by `(provider, provider_user_id)`. If the
  subject changed but the verified email matches an OIDC row, the repository
  links the new subject to that row. A matching `ANONYMOUS_EVENT` row is a
  conflict (`409 ERR_ACCOUNT_LINK_CONFLICT`) and is never taken over.
- `auth.users` has `UNIQUE(provider, provider_user_id)` (nullable) so
  concurrent callbacks cannot create duplicates; `auth.workspace_memberships`
  has `UNIQUE(workspace_id, user_id)` so the role lookup always sees one row.
- Event join is the deliberate exception: the event code authorizes one
  `MEMBER` membership in the code's workspace (see §9).

## 7. Workspace isolation

Tenant isolation is physical (one database per institution). **Workspace
isolation is logical and must be enforced on every id-addressed operation.**

- Every protected resource request sends `X-Workspace-ID`; a UUID is required
  even if the user belongs to only one workspace.
- The guard checks `auth.workspace_memberships` for `(user_id, workspace_id)`
  inside the tenant DB. `GET /auth/me` is the way the PWA learns the available
  workspace UUIDs; before Batch 1V, clients obtained them out of band.
- A cross-workspace object is reported as **`404 ERR_*_NOT_FOUND`, never
  `403`**, so the API does not reveal that the object exists elsewhere.
- Read paths, writes, subgraph traversal, proposal resolution and discussion
  lookups all filter by `workspaceId`. Edge creation additionally requires both
  endpoints in the request workspace.
- Role checks (`MODERATOR`/`ADMIN`) query the same membership table and never
  trust a client-supplied role.

## 8. Agent identity contract

System agents use the same bearer contract as humans, with `type` added.
`AgentTypeSchema` in `packages/shared-types` is the single allowlist:

| Requirement | Agent behaviour |
| --- | --- |
| `sub`, `tid`, `authorHash` | Required. The three AI agents use the seeded `SYSTEM_AGENT` user so audit trails resolve; the embedder is a utility and authors no graph rows, but still needs a valid 64-hex `authorHash`. |
| `type` | Required; `AGENT_EXTRACTOR`, `AGENT_RELACIONADOR`, `AGENT_CONSOLIDADOR` or `AGENT_EMBEDDER`. Unknown values are rejected, never downgraded to human. |
| `jti` | Required by contract; used for revocation when present. |
| `X-Workspace-ID` | **Required**; the agent is scoped to that workspace like any caller. |
| Tenant resolution | `tid` must resolve to a provisioned tenant. |
| Membership | **Skipped** — agents are platform actors and have no `workspace_memberships` row. |
| Refresh | Never issued; `/auth/refresh` rejects a `SYSTEM_AGENT` row. Agents are minted out of band (`db:mint-token` locally; a mounted token file or injected token in deployments — ADR-0021). |
| Roles | No implicit role. Moderator/admin-gated actions reject an agent that lacks the role. |
| Mutation path | Public API only (`POST /api/v1/nodes`, `POST /api/v1/proposals`, …) — never direct DB writes. |
| Pseudonym | Stable `authorHash` minted for the agent user; it appears as the author of agent-created objects. |

There is no separate agent namespace for existing routes: a valid agent token
can call the same endpoints as a human, subject to ontology and role rules.
ADR-0020 reserves one narrower future route, `PUT /api/v1/nodes/:id/embedding`,
which will additionally require `type=AGENT_EMBEDDER`; it is not implemented
yet.

## 9. Event-code join (FR-03)

`router.event_codes` is the documented exception to the two-database split
([ADR-0019](decisions/ADR-0019-global-event-codes.md)): the QR is scanned before
the tenant is known, so the registry must be global.

- The QR contains only the raw code (`vle_<24 base64url chars>`); no tenant
  slug or URL prefix. The API stores and looks up only its SHA-256 hash.
- Operators create codes with `db:event-code` (see
  [runbook-dev](runbook-dev.md)); the CLI validates the target workspace in the
  tenant DB before inserting.
- `POST /api/v1/auth/event-join { code, alias? }` consumes the code with one
  conditional `UPDATE` that enforces revocation, expiry and `max_uses`
  atomically. `NOT_FOUND`, `REVOKED` and `EXPIRED` all return `400
  ERR_EVENT_EXPIRED`; capacity returns `400 ERR_EVENT_FULL`.
- On success, one tenant transaction creates the `ANONYMOUS_EVENT` user with a
  random pseudonym and alias, adds the `MEMBER` membership, and stores the
  refresh session. The response is the same access-token + refresh-cookie
  session as OIDC login.
- Expiry/revocation blocks **new** joins only; existing anonymous users keep
  their refresh sessions and can continue contributing.
- Consumption happens before the tenant transaction, so a tenant DB failure can
  burn one use. This is an accepted trade-off (no distributed transaction).
- Public auth endpoints are rate-limited per IP because there is no tenant or
  workspace context yet.

## 10. Pseudonymity model

### Goal

Give each user a **stable public pseudonym** so that:

- the graph never exposes names, emails or IdP subjects;
- maintainer rights (“only the author approves/rejects”) are enforceable;
- one-vote-per-user is enforceable without storing the voter's identity next to
  the vote.

### Mechanism

- `auth.users.author_hash` is `NOT NULL UNIQUE`, 64 hex characters.
- The value is **opaque**: it is not a hash of the email, `sub`, or any
  institutional identifier. The API never derives it.
- OIDC JIT creation and anonymous event creation call `generateAuthorHash()`
  (32 random bytes hex-encoded). Existing accounts keep their stored pseudonym;
  the repository ignores a new value on update.
- The dev fixtures use deterministic `sha256("dev-<name>")` values so seeds,
  tokens and author rows match without a lookup.
- The value is carried verbatim in the `authorHash` JWT claim. `AuthGuard`
  validates only its shape; `AuthorHash` lowercases it.
- It is copied to every object that records authorship: `nodes.author_hash`,
  `edges.author_hash`, `edit_proposals.proposer_hash` / `resolved_by`,
  `meta.*.proposed_by`, `social.discussion_threads.created_by_hash`,
  `social.discussion_posts.author_hash`, and `interactions_log.user_hash`.

### No salt

There is **no `AUTHOR_HASH_SALT`**, no salt-reading service, no production salt
guard, and no derivation from `sub + salt`. The earlier per-institution salt
model and its “rotation is a data migration” runbook are obsolete.

Because the pseudonym is random and stored per user, there is no global key
whose rotation would re-key everyone. If an individual pseudonym ever had to
change (for example, a privacy request), that would be a coordinated data change
for that user and every row carrying the old value — not a configuration change
or a deployment-wide operation.

### Properties and limits

- The pseudonym is **stable and linkable** across a user's contributions. That
  is intentional: it is how reputation, maintainer rights and vote uniqueness
  work.
- It is pseudonymity, not anonymity. A database administrator with access to
  `auth.users` can map the pseudonym back to the account; the graph and public
  API cannot.
- Vote uniqueness is enforced by `UNIQUE(user_hash, target_id, target_type)` on
  `interactions_log`.
- Maintainer checks compare the caller's `authorHash` with the target's stored
  author. A token cannot forge another author because the JWT is signed.

## 11. Sessions, rotation and revocation

### Refresh-token format and storage

`v1.<tenant UUID>.<64 hex random>` is generated by the API. The tenant UUID is
routing metadata: it tells `/auth/refresh` which physical DB holds the session
row, without a router lookup by user. The 256-bit random part is the credential.
Only `SHA-256(token)` is stored in `auth.refresh_tokens`; a leaked table does not
produce usable credentials.

| Column | Meaning |
| --- | --- |
| `token_hash` | UNIQUE SHA-256 of the opaque token |
| `family_id` | Rotation family; all tokens descended from one login |
| `expires_at` | Absolute expiry (30 d default) |
| `revoked_at` | Set on rotation, logout or reuse detection |
| `user_id` | FK → `auth.users.id` ON DELETE CASCADE |

### Rotation and reuse

1. `/auth/refresh` parses the tenant UUID, resolves it in the router DB, and
   runs one conditional `UPDATE` that revokes the presented row only if it is
   unrevoked and unexpired.
2. On success it inserts a new row with the same `family_id`, returns a new
   access token, and sets the new cookie.
3. If the presented hash exists but is already revoked, the repository treats
   it as theft, revokes every unrevoked row in the family, and returns
   `REUSED` → `401 ERR_REFRESH_TOKEN_INVALID`.
4. An unknown/expired token is `INVALID` → `401 ERR_REFRESH_TOKEN_INVALID`.
5. A user row that disappeared, or a `SYSTEM_AGENT`, is also rejected; agents
   never use browser sessions.

### Cookie policy

| Attribute | Value | Reason |
| --- | --- | --- |
| Name | `vozlab_refresh` | — |
| `HttpOnly` | yes | XSS cannot read the 30-day credential |
| `SameSite` | `Lax` | Blocks cross-site POSTs; allows the top-level OIDC redirect |
| `Secure` | production only | Localhost development is HTTP |
| `Path` | `/api/v1/auth` | Graph requests only use the Bearer token |

The PWA must send `credentials: 'include'` to `/auth/refresh`,
`/auth/event-join` and `/auth/logout`. CORS allows exactly `WEB_ORIGIN` with
credentials; no wildcard origin is used. Restoring a session on page load means
calling `/auth/refresh` and keeping the returned access token in memory.

### Logout and access revocation

- `/auth/logout` writes `vozlab:blacklist:<jti>` with a TTL equal to the access
  token's remaining lifetime, then revokes the refresh family if the cookie is
  present, and clears the cookie.
- If Redis is disconnected, `isBlacklisted` logs a warning and treats the token
  as valid (fail-open). This trades revocation guarantees for availability.
- Rotating `JWT_SECRET` invalidates every outstanding access token immediately;
  it does **not** invalidate refresh tokens (they are opaque DB rows). Revoke
  the family or delete the rows for a full logout-all.
- There is no “log out all devices” endpoint; each refresh family is independent.

## 12. Authorization beyond the guards

| Action | Rule | Failure |
| --- | --- | --- |
| Approve / reject a proposal | Caller's `authorHash` equals the target node/edge/class author | `403 ERR_AUTHORIZATION_FAILED` |
| Auto-apply a proposal | `MODERATOR`/`ADMIN` membership + score ≥ 10 + age ≥ 14 days | `403`, `422 ERR_UNMET_AUTO_APPLY_CRITERIA` |
| Delete node / edge / post | Caller is the author | `403 ERR_AUTHORIZATION_FAILED` |
| Close a thread | Caller is the creator | `403 ERR_AUTHORIZATION_FAILED` |
| Activate an ontology class | `MODERATOR`/`ADMIN` membership | `403 ERR_AUTHORIZATION_FAILED` |
| Vote | Any authenticated caller scoped to the workspace; one vote per target | `409 ERR_DUPLICATE_INTERACTION` |
| Any object from another workspace | Treated as missing | `404 ERR_*_NOT_FOUND` |

## 13. Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `JWT_SECRET` | Yes | ≥ 32 chars; signs/verifies VozLab access tokens (HS256) |
| `JWT_EXPIRES_IN` | No | Access lifetime, default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh lifetime, default `30d` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Yes | Client credentials at the IdP |
| `OIDC_REDIRECT_URI` | Yes | Must be exactly `.../api/v1/auth/callback` |
| `OIDC_ISSUER`, `OIDC_JWKS_URL` | Yes | Explicit validation inputs; no discovery |
| `OIDC_AUTH_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL` | Yes | Provider endpoints |
| `OIDC_SCOPES` | No | Default `openid profile email` |
| `WEB_ORIGIN` | Yes | CORS allowlist and post-login redirect base |

## 14. Error codes

JSON auth endpoints use the standard error envelope. `/auth/callback` is a
browser redirect: failures go to `${WEB_ORIGIN}/auth/callback?error=<CODE>` and
the PWA renders them. `/auth/login` returns JSON only if it cannot build the
redirect URL.

| Code | Status | When |
| --- | --- | --- |
| `ERR_INVALID_TOKEN` | 401 | Missing/malformed Bearer, bad signature, missing `sub`/`authorHash`, invalid `authorHash`, unknown agent `type` |
| `ERR_TOKEN_EXPIRED` | 401 | `exp` in the past |
| `ERR_TOKEN_BLACKLISTED` | 401 | `jti` present and revoked |
| `ERR_REFRESH_TOKEN_INVALID` | 401 | Malformed/unknown/expired/reused refresh token, missing tenant, vanished user or agent session |
| `ERR_INVALID_OIDC_STATE` | 400 | Missing/expired/replayed `state` |
| `ERR_OIDC_EXCHANGE_FAILED` | 502 | Token endpoint rejection or invalid/mismatched ID token |
| `ERR_OIDC_UNAVAILABLE` | 503 | IdP transport failure or timeout |
| `ERR_EMAIL_NOT_VERIFIED` | 403 | IdP explicitly reports `email_verified: false` |
| `ERR_ACCOUNT_LINK_CONFLICT` | 409 | Verified email belongs to an `ANONYMOUS_EVENT` account, or a concurrent upsert conflict |
| `ERR_EVENT_EXPIRED` | 400 | Event code not found, revoked or past `expires_at` |
| `ERR_EVENT_FULL` | 400 | `max_uses` reached |
| `ERR_MISSING_WORKSPACE_HEADER` | 400 | No `X-Workspace-ID` on a resource route |
| `ERR_INVALID_WORKSPACE_HEADER` | 400 | Header is not a valid UUID |
| `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` | 403 | No membership, or missing `tid` in `tenantGuard` |
| `ERR_TENANT_NOT_PROVISIONED` | 403 | `tid` absent from the router DB, or no connection row |
| `ERR_AUTHORIZATION_FAILED` | 403 | Authenticated but not the author/moderator for this action |
| `ERR_RATE_LIMIT_EXCEEDED` | 429 | Either Redis bucket is over its cap, including public auth endpoints per IP |
| `ERR_REDIS_CONNECTION_FAILED` | 503 | The OIDC state store cannot read/write; blacklist and rate limiter fail open instead |
| `ERR_DATABASE_CONNECTION_FAILED` | 503 | Router/tenant driver or connection failure |

The full catalogue is in [errors.md](errors.md). See
[architecture.md](architecture.md) for the pool/topology details and
[api-reference.md](api-reference.md) for the endpoint list.
