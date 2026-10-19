# TASK-07 — Rate Limiter Fixed-Window Correctness (NFR-08)

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-01 · **Size:** S
> **Self-contained:** yes.

## 1. Context
NFR-08 requires per-tenant/workspace rate limiting backed by Redis:
- `GET`: 300 requests/minute.
- `POST`/`PUT`/`DELETE`/`PATCH`: 30 requests/minute.

`apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts` implements this with
`INCRBYFLOAT` + `EXPIRE`, but calls `EXPIRE` **on every request**:

```ts
const count = Number(await this.client.incrByFloat(key, 1));
if (count > limitMax) { ... return true; }
await this.client.expire(key, windowSeconds);   // <-- refreshes TTL every request
```

Because the TTL is refreshed continuously while traffic flows, the counter effectively never
resets as long as the client keeps sending requests. Once a bucket reaches `limitMax`, the
client stays blocked until traffic pauses for a whole window — a de-facto lockout bug.

Config source: `apps/api/src/shared/config/env.ts` → `RATE_LIMIT_READ_MAX` (300),
`RATE_LIMIT_WRITE_MAX` (30), `RATE_LIMIT_WINDOW_MS` (60000).

## 2. Objective
Implement a correct **fixed window** anchored at the first request in the window, so the
counter resets after `RATE_LIMIT_WINDOW_MS`.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- Errors use `ERROR_CODES` (`ERR_RATE_LIMIT_EXCEEDED` = 429).
- The limiter must stay **fail-open** on Redis errors (never block legitimate traffic when
  Redis is down), matching the current behaviour and documented intent.
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts` |

## 5. Step-by-step instructions
1. Replace the `INCRBYFLOAT` logic with integer `INCR` and set the TTL **only when the key is
   created** (i.e. when the returned count is `1`):
   ```ts
   const count = await this.client.incr(key);
   if (count === 1) {
     await this.client.expire(key, windowSeconds);
   }
   if (count > limitMax) { /* ... 429 path ... */ return true; }
   return false;
   ```
   Keep the existing key format `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`.
2. Keep `getRateLimitMax(method)` exactly as-is (it already encodes the NFR-08 numbers from env).
3. Keep `isRateLimited(...)` signature and the `rateLimitMiddleware(limiter)` factory
   unchanged so `routes.ts` keeps working.
4. Remove the now-unused "set shorter TTL to quickly release the bucket" branch
   (`expire(key, floor(window/2))`).
5. Optionally add a short comment documenting the fixed-window semantics and the trade-off
   versus a sliding window / token bucket.

## 6. Constraints & gotchas
- `windowSeconds = env.RATE_LIMIT_WINDOW_MS / 1000`; ensure it is an integer for `EXPIRE`
  (`Math.ceil` if needed).
- Do not change the bucket key to include the user id — the design is per tenant+workspace+method.
- Preserve the fail-open `catch` block and its log line.

## 7. Acceptance criteria
- [ ] `EXPIRE` is only issued when `count === 1`.
- [ ] The 429 path still returns `ERR_RATE_LIMIT_EXCEEDED`.
- [ ] Fail-open behaviour on Redis error is preserved.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
# Manual (requires env + Redis): send > RATE_LIMIT_WRITE_MAX POSTs within one window and
# confirm 429 starts after the limit, then confirms recovery after the window elapses.
```

## 9. Definition of done / handoff
- Build passes and the fixed-window behaviour is verifiable manually.
- Mark `TASK-07` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Distributed/sliding-window algorithms, per-IP limits, or moving the counters to a Lua script
  (a Lua script is an acceptable *implementation detail* only if it preserves fixed-window
  semantics; prefer the simple `INCR`+conditional-`EXPIRE` version).
