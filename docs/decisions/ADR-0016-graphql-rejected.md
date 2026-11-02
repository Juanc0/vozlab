# ADR-0016: GraphQL rejected; REST + Zod + `X-Workspace-ID` is the contract

- Status: Rejected
- Date: 2026-10-19

## Context

GraphQL was considered as an alternative to the REST surface. The specification mandates Fastify + REST + Zod validation and a per-request `X-Workspace-ID` header. Physical tenant isolation and workspace membership are enforced by a guard chain before a handler runs, and the graph view already has a tailored bounded-subgraph endpoint (NFR-01).

A GraphQL endpoint would have to re-implement tenant/workspace resolution and authorization per field or per resolver, risks N+1 queries on the graph view, and would need a subscription transport that duplicates the planned SSE channel.

## Decision

GraphQL is rejected. The API contract is Fastify + REST + Zod schemas from `@vozlab/shared-types` + `X-Workspace-ID`, with the guard order `authGuard -> tenantWorkspaceGuard -> rateLimit`.

A thin **read-only** GraphQL facade may be added later if query flexibility becomes a measured bottleneck. It would reuse the existing use cases and would not change the REST contract or the isolation model; it is a new milestone, not a refactor.

## Consequences

### Positive

- One guard chain and one authorization model, applied before any handler.
- The client contract is explicit and validated by Zod at the boundary.
- No resolver-level N+1 or per-field tenancy re-implementation.
- Caching, rate limiting and error mapping stay at the HTTP route level.

### Negative / costs

- Clients cannot compose arbitrary field selections; the API must add endpoints for new read shapes.
- Some clients may over-fetch a fixed DTO or need multiple round-trips.
- A future GraphQL facade would still need resolver-level authorization and query-cost controls.

## Links

- `docs/archive/spec-v1/system/system_04_authentication_and_multitenancy.md` §2.2
- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §5
- `apps/api/src/infrastructure/http/routes.ts`
- `packages/shared-types/src/schemas/`
- `.claude/reviews/REVIEW-2026-10-17_phase-1r.md` concern #2
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Deferred (GraphQL)
