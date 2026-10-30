# Errors

Errors use one envelope:

```json
{ "code": "ERR_NODE_NOT_FOUND", "message": "Node not found" }
```

`code` and `message` come from
`packages/shared-types/src/errors/http-errors.ts`; validation failures add
`issues` from Zod. Clients should branch on `code`, never parse `message`.
Controllers forward only typed `DomainError`/`InfrastructureError` codes; any
unknown error becomes `500 ERR_INTERNAL_SERVER_ERROR`.

## Mapping

- Guards and controllers send dictionary codes directly for request,
  authentication, authorization and validation failures. `/auth/callback` is a
  browser redirect: it encodes the same code in
  `${WEB_ORIGIN}/auth/callback?error=<CODE>` instead of sending a JSON body.
- Use cases throw `DomainError`; `mapDomainError` forwards a code only when it
  is a known `ErrorCode`.
- Infrastructure adapters throw `InfrastructureError`; the HTTP layer preserves
  its code, so dependency outages surface as 5xx (503 for unavailable
  services), never as 403.
- Anything else becomes `500 ERR_INTERNAL_SERVER_ERROR`.

## Retry policy

| Status | Retry? | Guidance |
| --- | --- | --- |
| 400, 401, 403, 404, 409, 422 | No | Fix the request, credentials, scope or state. Repeating unchanged is terminal. |
| 429 | Yes | Wait for the fixed window to reset; no `Retry-After` header is sent. |
| 500 | Maybe | Retry with backoff; if persistent, report it. |
| 502 | Maybe | The IdP rejected the code/token; retry only after a fresh login. |
| 503 | Yes | Dependency unavailable; retry with backoff. |

## 4xx — client and request errors

| Code | Status | Returned when |
| --- | --- | --- |
| `ERR_MISSING_WORKSPACE_HEADER` | 400 | `X-Workspace-ID` is absent on a protected route. |
| `ERR_INVALID_WORKSPACE_HEADER` | 400 | `X-Workspace-ID` is not a valid UUID. |
| `ERR_EVENT_CODE_INVALID` | 404 | Event join: the code is unknown, revoked, expired, at capacity or not of the EVENT purpose on `POST /auth/event-join` (one answer, no state disclosure — ADR-0046). |
| `ERR_INVALID_OIDC_STATE` | 400 | OIDC state is missing, expired or already consumed (callback). |
| `ERR_INVALID_TOKEN` | 401 | Missing/malformed `Authorization: Bearer`, bad signature, missing `sub`/`authorHash`, non-64-hex `authorHash`, or an unknown agent `type`. |
| `ERR_TOKEN_EXPIRED` | 401 | JWT verification failed with `TokenExpiredError`. |
| `ERR_TOKEN_BLACKLISTED` | 401 | The token `jti` exists in the Redis revocation list. |
| `ERR_REFRESH_TOKEN_INVALID` | 401 | Malformed/unknown/expired/reused refresh token, unprovisioned tenant, vanished user, or a `SYSTEM_AGENT` session. Reuse also revokes the family. |
| `ERR_EMAIL_NOT_VERIFIED` | 403 | The IdP explicitly reports `email_verified: false`. |
| `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` | 403 | No `tid` claim, or the caller is not a member of the declared `X-Workspace-ID` workspace. System agents skip the membership check. |
| `ERR_AUTHORIZATION_FAILED` | 403 | Authenticated but not allowed: not the node/edge/post author, not the thread creator, not the proposal target maintainer, or not `MODERATOR`/`ADMIN` for auto-apply or class activation. |
| `ERR_TENANT_NOT_PROVISIONED` | 403 | The JWT `tid`/identity claim has no router tenant row, the tenant has no `tenant_connections` row, or an event code points at a vanished tenant. |
| `ERR_ACCOUNT_LINK_CONFLICT` | 409 | A concurrent OIDC upsert lost the identity/handle race (DEC-4 removed the email-based link; the code now only marks concurrent-creation conflicts). |
| `ERR_NODE_NOT_FOUND` | 404 | Missing, soft-deleted or foreign-workspace node: get/delete node, subgraph root, edge endpoint, proposal/vote target. |
| `ERR_EDGE_NOT_FOUND` | 404 | Missing, soft-deleted or foreign-workspace edge: get/update/delete edge, proposal/vote target, or a vanished target when resolving a proposal. |
| `ERR_PROPOSAL_NOT_FOUND` | 404 | Missing or foreign-workspace proposal: get, approve, reject, auto-apply, or vote target. |
| `ERR_THREAD_NOT_FOUND` | 404 | Missing or foreign-workspace discussion thread: add/list posts, close, or thread resolution while deleting a post. |
| `ERR_POST_NOT_FOUND` | 404 | Missing, soft-deleted or foreign-workspace post: delete or vote target. |
| `ERR_DUPLICATE_INTERACTION` | 409 | The caller already has a **different** interaction type for the same target. Repeating the same type is idempotent and returns `201`. |
| `ERR_INVALID_RELATION_DOMAIN_RANGE` | 422 | Creating an edge whose endpoint types violate a matching object property's domain/range. Unknown `relationKey` is not rejected. |
| `ERR_INVALID_STATE_TRANSITION` | 422 | Resolving a non-`PENDING` proposal, activating a non-`PROPOSED` class, or closing an already closed thread. Node/edge transitions are not exposed over HTTP. |
| `ERR_UNMET_AUTO_APPLY_CRITERIA` | 422 | Auto-apply on a pending proposal younger than 14 days or with `communityScore < 10`. |
| `ERR_VALIDATION_FAILED` | 422 | Zod body/query failure, malformed cursor, unknown or inactive `typeKey`, duplicate ontology `systemKey`, unknown domain/range class key, or a missing/foreign ontology class target. |
| `ERR_RATE_LIMIT_EXCEEDED` | 429 | Per-actor or per-workspace fixed-window limit exceeded. Defaults: 300/min reads, 30/min writes, workspace ceiling ×10. Redis outages fail open. |

## 5xx — server and dependency errors

| Code | Status | Returned when |
| --- | --- | --- |
| `ERR_INTERNAL_SERVER_ERROR` | 500 | Unexpected error, including an unwrapped driver failure or an unknown error code. |
| `ERR_OIDC_EXCHANGE_FAILED` | 502 | Token-endpoint rejection or an invalid ID token (signature, issuer, audience, nonce). |
| `ERR_DATABASE_CONNECTION_FAILED` | 503 | The router/tenant database cannot be queried, or tenant connection config cannot be resolved. Raised as `InfrastructureError`. |
| `ERR_OIDC_UNAVAILABLE` | 503 | The IdP token endpoint is unreachable or times out. |
| `ERR_REDIS_CONNECTION_FAILED` | 503 | The OIDC state store cannot read/write. The blacklist and rate limiter fail open instead of returning this. |
| `ERR_LLM_UNAVAILABLE` | 503 | **Reserved.** No LLM integration exists. |
| `ERR_SERVICE_UNAVAILABLE` | 503 | **Reserved.** `/health/ready` returns its own body when a dependency is down, not this envelope. |

## Rules of thumb

- **Foreign workspace = 404, not 403.** Objects outside `X-Workspace-ID` read as
  missing so their existence is not leaked. 403 means the caller lacks
  membership or role, not that the object lives elsewhere.
  See [ADR-0008](decisions/ADR-0008-cross-workspace-404.md).
- **Infrastructure failures become 5xx, never 403.** A database or driver
  outage must not be reported as an authorization failure.
- **Only catalogue codes are sent.** `DomainError.code` values and
  `InfrastructureError.code` values are validated against `ERROR_CODES`;
  anything else degrades to `ERR_INTERNAL_SERVER_ERROR`.
- **Health readiness is the exception.** `GET /health/ready` returns
  `503 { "status": "degraded", "checks": {...} }`, which is not an error
  envelope.

Related: [API reference](api-reference.md) · [Conventions](conventions.md) ·
[Domain model](domain-model.md).
