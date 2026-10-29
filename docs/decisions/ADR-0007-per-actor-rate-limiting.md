# ADR-0007: Per-actor rate limiting with a per-workspace ceiling

- Status: Accepted
- Date: 2026-10-19

## Context

NFR-08 originally said "per IP/Tenant". The first implementation keyed its Redis bucket as `tenant:workspace:method`, so the entire workspace shared one quota and a single member could exhaust the write bucket for every colleague. The tenant was protected; the caller was not.

## Decision

The rate limiter enforces two fixed-window buckets per request, backed by Redis:

- **Actor bucket**: key `vozlab:ratelimit:{tenant}:{workspace}:{method}:{actor}`, where `actor` is the authenticated `authorHash` or, when anonymous, the remote IP. It is evaluated first.
- **Workspace ceiling**: key `vozlab:ratelimit:{tenant}:{workspace}:{method}`, with a cap of `perActorMax * RATE_LIMIT_WORKSPACE_MULTIPLIER` (default 10).

Per-actor caps are 300 requests/minute for reads and 30 requests/minute for writes; `RATE_LIMIT_WINDOW_MS` defaults to 60,000 ms. The bucket uses `INCR` and sets `EXPIRE` only when the count becomes 1, anchoring the window at the first request. A request is rejected with 429 `ERR_RATE_LIMIT_EXCEEDED` when either bucket is over its cap. `resetRateLimit` deletes both keys. A Redis error fails open, preserving availability.

## Consequences

### Positive

- One actor cannot lock out the workspace.
- A workspace still has a coarse ceiling, so many actors cannot overwhelm the tenant together.
- The window no longer refreshes on every request, so a bucket cannot stay locked indefinitely.
- The key contains tenant and workspace, so the quota follows the resolved request context.

### Negative / costs

- Every request performs two Redis reads/writes instead of one.
- Anonymous callers behind one NAT share an IP bucket.
- A fixed window allows a burst at the boundary and is less smooth than a sliding window or token bucket.
- Fail-open means a Redis outage removes the protection until Redis returns.

## Links

- `apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts`
- `apps/api/src/shared/config/env.ts` (`RATE_LIMIT_*`)
- `docs/archive/spec-v1/system/system_01_functional_and_non_functional_requirements.md` NFR-08
- `docs/archive/reviews/REVIEW-2026-10-17_phase-1r.md` concern #4
- `docs/archive/tasks/TASK-26_rate-limit-per-actor.md`
