# ADR-0014: Real auth endpoints deferred; dev JWT minting is the interim

- Status: Superseded
- Date: 2026-10-19
- Superseded by: [ADR-0018](ADR-0018-oidc-jit-hybrid-sessions.md) (auth flow implemented)

## Context

The specification describes OIDC login/callback/logout, event-QR join and an `event_codes` table. The repository has none of those endpoints or tables. What exists is a dev identity bootstrap: `db:seed:dev` provisions four users, three memberships and a workspace, and `db:mint-token --as <role>` signs an HS256 token with `JWT_SECRET` carrying `sub`, `tid`, `jti` and `authorHash` (plus `type` for the agent), valid for 12 hours.

Tenant routing currently resolves only the `tid` claim through `tenants.oidc_tenant_id`. The `iss` claim is not used to resolve a tenant, so an IdP that identifies tenants only by issuer is not supported today.

## Decision

The real auth flow is deferred to its own milestone: `/api/v1/auth/login`, `/auth/callback`, `/auth/logout` (which must write the `jti` to the Redis blacklist), `/auth/event-join` and the `event_codes` table. Until then:

- Local development and tests use the seeded identities and `db:mint-token`.
- The API accepts only HS256 tokens signed with `JWT_SECRET`; it does not perform an OIDC code exchange or create users at login.
- Tenant resolution is `tid`-only. No `iss`-based resolution or fallback is implemented.

## Consequences

### Positive

- Endpoints and guards can be exercised locally without an IdP.
- The identity contract (`sub`, `tid`, `jti`, `authorHash`, `type`) is fixed before the real flow is built.
- The deferred work has a concrete endpoint/table list instead of an implicit gap.

### Negative / costs

- There is no production authentication path: token minting requires the signing secret and bypasses IdP verification.
- No user upsert, session invalidation endpoint or event QR onboarding exists; `event_codes` has no schema.
- An `iss`-only tenant cannot be provisioned until the resolution rule is extended.
- The dev script is a local tool; it must not be exposed as an API endpoint or shipped as a production credential source.

## Links

- `packages/database/scripts/dev-identities.ts`
- `packages/database/scripts/mint-dev-token.ts`
- `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts`
- `apps/api/src/domain/ports/IRouterDatabase.ts`
- `docs/archive/spec-v1/system/system_04_authentication_and_multitenancy.md` §1.1, §3
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Deferred (auth flow endpoints)
- `.claude/tasks/TASK-19_dev-identity-bootstrap.md`
