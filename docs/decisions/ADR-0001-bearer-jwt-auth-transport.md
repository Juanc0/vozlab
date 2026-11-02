# ADR-0001: Bearer JWT as the authentication transport

- Status: Accepted
- Date: 2026-10-19
- Supersedes: the HTTP-only `vozlab_session` cookie described in `docs/archive/spec-v1/system/system_04` §1 (that document is archived; this ADR is authoritative).

## Context

`system_04` originally specified an HTTP-only session cookie. The API is called by a SvelteKit PWA and, later, by Python workers; every protected request must also select a workspace with `X-Workspace-ID`. Cookies add CSRF handling and couple the API to browser session semantics, while workers need an explicit credential. Phase 1R recorded the switch to Bearer JWT.

`AuthGuard` verifies an HS256 JWT with `JWT_SECRET` and checks the `jti` against a Redis blacklist in O(1) when the claim is present. Tokens carry `sub`, `tid`, `jti` and a 64-hex `authorHash`; a `type` claim marks an allow-listed system agent. `AuthGuard` rejects a token without `sub` or a valid `authorHash`. Protected routes run `authGuard -> tenantWorkspaceGuard -> rateLimit`.

## Decision

The API accepts authentication only through `Authorization: Bearer <jwt>`. It does not set or read a session cookie. The client stores the token and attaches it to every request together with `X-Workspace-ID`; the workspace is never inferred from the token.

## Amendment: refresh credential (2026-10-19)

The bearer decision still holds for **access** tokens. Batch 1V added one
cookie, but it is not a session cookie and is not accepted as authentication:
`vozlab_refresh` carries an opaque rotating refresh credential on
`/api/v1/auth`, and `/auth/refresh` exchanges it for a new JSON access token
([ADR-0018](ADR-0018-oidc-jit-hybrid-sessions.md)). Graph requests still require
`Authorization: Bearer <jwt>`. The original "no cookie/CSRF surface" positive is
therefore narrowed to the graph surface; refresh has a `SameSite=Lax`
cookie-CSRF consideration.

## Consequences

### Positive

- The API stays stateless; any replica can serve any request.
- The same credential mechanism works for the PWA, CLI tooling and workers.
- Revocation is a Redis `jti` entry with the token's remaining TTL, with no server-side session store.
- There is no cookie/CSRF surface in the API.

### Negative / costs

- The client is responsible for token storage; a token in reachable JavaScript storage is an XSS target.
- Browsers do not attach the token automatically; the PWA HTTP client must do it.
- Revocation is only as immediate as the blacklist write. The logout endpoint that performs it is deferred (ADR-0014).

## Links

- `docs/archive/spec-v1/system/system_04_authentication_and_multitenancy.md` §1, §5 (superseded transport)
- `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts`
- `apps/api/src/infrastructure/events/RedisTokenBlacklist.ts`
- `apps/api/src/infrastructure/http/routes.ts` (guard chain)
- `.claude/reviews/REVIEW-2026-10-17_phase-1r.md` §3, drift 1
