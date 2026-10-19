# Authentication and tenancy

VozLab separates three questions:

1. **Who is calling?** — authentication (delegated to an institutional IdP in the target design).
2. **Which institution's database?** — tenant resolution from the JWT `tid` claim through the router DB.
3. **Which slice of that database?** — workspace isolation from `X-Workspace-ID` plus a membership row.

Today only the **verification and isolation** half exists. There are no login, callback, refresh, logout or event-join endpoints; tokens are minted by a development script. This document describes the contract the future auth flow must satisfy, then the planned work.

## 1. Current state

| Concern | Reality on 2026-10-19 |
| --- | --- |
| Transport | `Authorization: Bearer <jwt>` only — **no cookies** |
| Token format | HS256 JWT signed with `JWT_SECRET` (≥ 32 chars) |
| Token issuance | `pnpm --filter @vozlab/database db:mint-token -- --as <identity>` (dev only, 12 h) |
| Login / callback / logout / refresh | Not implemented |
| OIDC | `OIDC_*` env vars are required at boot but no endpoint uses them |
| Tenant routing | `tid` claim → `tenants.oidc_tenant_id`; **no `iss` resolution** |
| Workspace isolation | `X-Workspace-ID` + `auth.workspace_memberships` on every protected route |
| Pseudonym | Opaque 64-hex value stored per user; **no salt, no derivation** |

The API is a **resource server**, not an identity provider. A future `/auth/*` flow will exchange an OIDC code for an ID token, upsert `auth.users`, assign a random pseudonym, and issue a VozLab bearer token.

## 2. Bearer token contract

| Claim | Required | Enforced by `AuthGuard` | Meaning |
| --- | --- | --- | --- |
| `sub` | Yes | Yes — missing → `401 ERR_INVALID_TOKEN` | Internal `auth.users.id` UUID. Membership is resolved by this value, so it must be the VozLab user id, not a raw IdP subject. |
| `tid` | Yes | Indirectly — missing → `403` in the tenant guard | OIDC tenant identifier matched against `tenants.oidc_tenant_id`. `iss` is not consulted. |
| `jti` | Yes by contract | Only when present | Unique token id / Redis blacklist key. A token without `jti` skips the revocation check. |
| `authorHash` | Yes | Yes — must match `^[a-fA-F0-9]{64}$`, else `401 ERR_INVALID_TOKEN` | Opaque pseudonym assigned at account creation and stored on `auth.users.author_hash`. Never derived by the API. |
| `type` | Only for agents | Yes | One of `AGENT_EXTRACTOR`, `AGENT_RELACIONADOR`, `AGENT_CONSOLIDADOR`. Any other value → `401 ERR_INVALID_TOKEN`. Absent = human. |
| `iat`, `exp` | Standard | `exp` verified by `jsonwebtoken` | Expired → `401 ERR_TOKEN_EXPIRED`. |

The guard verifies the signature with the shared HS256 secret and does not check `iss`, `aud` or a JWKS. That is an accepted interim contract for the API core; a production IdP integration must add asymmetric signature/JWKS verification. `JWT_EXPIRES_IN` (8 h) and `JWT_REFRESH_EXPIRES_IN` (30 d) exist in config for future issuance; the API never signs tokens.

## 3. Guard chain

Every `/api/v1/*` route uses the same `preHandler` array, in this order:

```text
Authorization: Bearer <jwt>
  -> authGuard
  -> tenantWorkspaceGuard
  -> rateLimit
  -> controller / use case
```

| Guard | What it checks | Failure |
| --- | --- | --- |
| `authGuard` | Header shape; HS256 signature/expiry; `jti` blacklist; `sub` and 64-hex `authorHash`; `type` allowlist | `401 ERR_INVALID_TOKEN`, `401 ERR_TOKEN_EXPIRED`, `401 ERR_TOKEN_BLACKLISTED` |
| `tenantWorkspaceGuard` | `X-Workspace-ID` present and UUID; `tid` present; tenant exists in router DB; membership in tenant DB (humans only) | `400 ERR_MISSING_WORKSPACE_HEADER`, `400 ERR_INVALID_WORKSPACE_HEADER`, `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`, `403 ERR_TENANT_NOT_PROVISIONED`, `503 ERR_DATABASE_CONNECTION_FAILED` |
| `rateLimit` | Per-actor and per-workspace fixed windows in Redis | `429 ERR_RATE_LIMIT_EXCEEDED` |

`authGuard` runs first so no unauthenticated request can reach a tenant lookup. The rate limiter runs last because it needs the resolved `tid`, `workspaceId` and `authorHash`.

Rate limiting is fail-open: a Redis outage logs a warning and allows the request. The actor key uses `authorHash` (agents included), falling back to the remote IP for unauthenticated callers. Reads default to 300 req/min, writes to 30 req/min, with the workspace ceiling = per-actor max × `RATE_LIMIT_WORKSPACE_MULTIPLIER` (default 10).

## 4. Tenant resolution and database pools

1. `authGuard` attaches `req.oidcTenantId = payload.tid`.
2. `tenantWorkspaceGuard` calls `routerDb.findTenantByOidcId(tid)` against the router DB.
3. The router returns the internal tenant UUID and slug; unknown id → `403 ERR_TENANT_NOT_PROVISIONED`.
4. `ConnectionPoolManager` resolves `tenant_connections` by that UUID and caches a Drizzle pool per `tid`.
5. Repositories receive only the internal `tid`; the OIDC string never reaches the tenant DB.

The dev seed provisions `tid = sabana`, tenant UUID `11111111-1111-4111-8111-111111111111`, workspace UUID `33333333-3333-4333-8333-333333333333`, the router DB `vozlab_router`, and the tenant DB `vozlab_tenant_dev`.

A missing `tenant_connections` row is a configuration error (`403`); a driver/connection failure is infrastructure (`503`). The router client preserves that distinction.

## 5. Workspace isolation

Tenant isolation is physical (one database per institution). **Workspace isolation is logical and must be enforced on every id-addressed operation.**

- Every protected request sends `X-Workspace-ID`; a UUID is required even if the user belongs to only one workspace.
- The guard checks `auth.workspace_memberships` for `(user_id, workspace_id)` inside the tenant DB. There is no workspace list endpoint; clients obtain the UUID out of band (the dev seed prints it).
- A cross-workspace object is reported as **`404 ERR_*_NOT_FOUND`, never `403`**, so the API does not reveal that the object exists elsewhere.
- Read paths, writes, subgraph traversal, proposal resolution and discussion lookups all filter by `workspaceId`. Edge creation additionally requires both endpoints in the request workspace.
- Role checks (`MODERATOR`/`ADMIN`) query the same membership table and never trust a client-supplied role.

## 6. Agent identity contract

System agents use the same bearer contract as humans, with `type` added. `AgentTypeSchema` in `packages/shared-types` is the single allowlist:

| Requirement | Agent behaviour |
| --- | --- |
| `sub`, `tid`, `authorHash` | Required; `sub` is the seeded `SYSTEM_AGENT` user so audit trails resolve. |
| `type` | Required; `AGENT_EXTRACTOR`, `AGENT_RELACIONADOR` or `AGENT_CONSOLIDADOR`. Unknown values are rejected, never downgraded to human. |
| `jti` | Required by contract; used for revocation when present. |
| `X-Workspace-ID` | **Required**; the agent is scoped to that workspace like any caller. |
| Tenant resolution | `tid` must resolve to a provisioned tenant. |
| Membership | **Skipped** — agents are platform actors and have no `workspace_memberships` row. |
| Roles | No implicit role. Moderator/admin-gated actions reject an agent that lacks the role. |
| Mutation path | Public API only (`POST /api/v1/nodes`, `POST /api/v1/proposals`, …) — never direct DB writes. |
| Pseudonym | Stable `authorHash` minted for the agent user; it appears as the author of agent-created objects. |

There is no separate agent secret or agent-only route namespace. A valid agent token can call the same endpoints as a human, subject to ontology and role rules.

## 7. Pseudonymity model

### Goal

Give each user a **stable public pseudonym** so that:

- the graph never exposes names, emails or IdP subjects;
- maintainer rights (“only the author approves/rejects”) are enforceable;
- one-vote-per-user is enforceable without storing the voter's identity next to the vote.

### Mechanism

- `auth.users.author_hash` is `NOT NULL UNIQUE`, 64 hex characters.
- The value is **opaque**: it is not a hash of the email, `sub`, or any institutional identifier. The API never derives it.
- The future auth flow assigns a **random** pseudonym per account (for example, 32 random bytes hex-encoded). The dev fixtures use deterministic `sha256("dev-<name>")` values so seeds, tokens and author rows match.
- The value is carried verbatim in the `authorHash` JWT claim. `AuthGuard` validates only its shape; `AuthorHash` lowercases it.
- It is copied to every object that records authorship: `nodes.author_hash`, `edges.author_hash`, `edit_proposals.proposer_hash` / `resolved_by`, `meta.*.proposed_by`, `social.discussion_threads.created_by_hash`, `social.discussion_posts.author_hash`, and `interactions_log.user_hash`.

### No salt

There is **no `AUTHOR_HASH_SALT`**, no salt-reading service, no production salt guard, and no derivation from `sub + salt`. The earlier per-institution salt model and its “rotation is a data migration” runbook are obsolete.

Because the pseudonym is random and stored per user, there is no global key whose rotation would re-key everyone. If an individual pseudonym ever had to change (for example, a privacy request), that would be a coordinated data change for that user and every row carrying the old value — not a configuration change or a deployment-wide operation. No rotation tooling exists today, and none is required by the current design.

### Properties and limits

- The pseudonym is **stable and linkable** across a user's contributions. That is intentional: it is how reputation, maintainer rights and vote uniqueness work.
- It is pseudonymity, not anonymity. A database administrator with access to `auth.users` can map the pseudonym back to the account; the graph and public API cannot.
- Vote uniqueness is enforced by `UNIQUE(user_hash, target_id, target_type)` on `interactions_log`.
- Maintainer checks compare the caller's `authorHash` with the target's stored author. A token cannot forge another author because the JWT is signed.

## 8. Authorization beyond the guards

| Action | Rule | Failure |
| --- | --- | --- |
| Approve / reject a proposal | Caller's `authorHash` equals the target node/edge/class author | `403 ERR_AUTHORIZATION_FAILED` |
| Auto-apply a proposal | `MODERATOR`/`ADMIN` membership + score ≥ 10 + age ≥ 14 days | `403`, `422 ERR_UNMET_AUTO_APPLY_CRITERIA` |
| Delete node / edge / post | Caller is the author | `403 ERR_AUTHORIZATION_FAILED` |
| Close a thread | Caller is the creator | `403 ERR_AUTHORIZATION_FAILED` |
| Activate an ontology class | `MODERATOR`/`ADMIN` membership | `403 ERR_AUTHORIZATION_FAILED` |
| Vote | Any authenticated caller scoped to the workspace; one vote per target | `409 ERR_DUPLICATE_INTERACTION` |
| Any object from another workspace | Treated as missing | `404 ERR_*_NOT_FOUND` |

## 9. Revocation and the Redis blacklist

`AuthGuard` checks `vozlab:blacklist:<jti>` with a single Redis `GET`. `revoke(jti, ttlSeconds)` writes the key with a TTL equal to the token's remaining lifetime, so the blacklist self-cleans.

- There is **no logout endpoint** yet; `revoke` is not called by any route.
- If Redis is disconnected, `isBlacklisted` logs a warning and treats the token as valid (fail-open). This trades revocation guarantees for availability.
- Rotating `JWT_SECRET` invalidates every outstanding token immediately; there is no graceful key rollover.

## 10. Planned auth work (FR-01/02/03)

| Requirement | Planned shape |
| --- | --- |
| FR-01 OIDC/SSO | `GET /api/v1/auth/login` → 302 to the IdP; `GET/POST /api/v1/auth/callback` exchanges the code, validates the ID token, upserts `auth.users`, assigns a random `author_hash`, issues a VozLab bearer token. No passwords. |
| FR-02 tenant by claim | Extend resolution to the IdP's validated `tid` (and `iss` if a provider requires it). The current guard already resolves `tid`; what is missing is the code/token exchange and cryptographic IdP validation. |
| FR-03 event QR | `event_codes` table in the tenant DB, `POST /api/v1/auth/event-join`, expiry/capacity checks, random alias, reconnection token, and blocking new anonymous users after the event ends. |
| Logout | `POST /api/v1/auth/logout` → `RedisTokenBlacklist.revoke(jti, remainingTtl)`. No cookie to clear. |
| Refresh | `JWT_REFRESH_EXPIRES_IN` is reserved; no refresh endpoint or refresh-token store exists. |

The PWA is expected to keep using the bearer header; the cookie-based session described in the archived specification is not the chosen transport.

## 11. Error codes

| Code | Status | When |
| --- | --- | --- |
| `ERR_INVALID_TOKEN` | 401 | Missing/malformed Bearer token, bad signature, missing `sub`, invalid `authorHash`, unknown agent `type` |
| `ERR_TOKEN_EXPIRED` | 401 | `exp` in the past |
| `ERR_TOKEN_BLACKLISTED` | 401 | `jti` present and revoked |
| `ERR_MISSING_WORKSPACE_HEADER` | 400 | No `X-Workspace-ID` |
| `ERR_INVALID_WORKSPACE_HEADER` | 400 | Header is not a valid UUID |
| `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` | 403 | No membership, or missing `tid` in the guard |
| `ERR_TENANT_NOT_PROVISIONED` | 403 | `tid` absent from the router DB, or no connection row |
| `ERR_AUTHORIZATION_FAILED` | 403 | Authenticated but not the author/moderator for this action |
| `ERR_RATE_LIMIT_EXCEEDED` | 429 | Either Redis bucket is over its cap |
| `ERR_DATABASE_CONNECTION_FAILED` | 503 | Router/tenant driver or connection failure |

The full catalogue is in [errors.md](errors.md). See [architecture.md](architecture.md) for the pool/topology details and [api-reference.md](api-reference.md) for the protected endpoint list.
