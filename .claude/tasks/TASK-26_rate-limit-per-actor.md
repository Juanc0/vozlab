# TASK-26 — Rate limit per Actor (not per Workspace)

> **Batch:** Phase 1S.3 (Policy) · **Depends on:** TASK-20 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`RateLimitingMiddleware` keys the bucket as `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`
— a **shared** bucket for the whole workspace. One member can burn the write budget and lock
out every colleague. `docs/system/system_01` NFR-08 says "per IP/Tenant", so the code satisfies
the letter but not the intent (fairness + abuse isolation).

TASK-20 guarantees `req.user.authorHash` is a real, per-caller pseudonym (no `'unknown'`
fallback), which makes it a usable actor key.

## 2. Objective
Add an **actor** dimension to the limiter so each caller has their own bucket, while keeping a
coarse workspace ceiling so a single workspace still cannot overwhelm the tenant.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Fail-open on Redis errors (already the behaviour) — keep it.
- Fixed-window `INCR` + conditional `EXPIRE` (TASK-07) — keep it; do not rewrite as sliding window.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/shared/config/env.ts` (`RATE_LIMIT_WORKSPACE_MULTIPLIER`) |
| Edit | `.env.example` |
| Edit | `apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts` |
| Edit | `apps/api/src/infrastructure/http/routes.ts` (only if the middleware signature changes) |
| Edit | `docs/system/system_01_*.md` (NFR-08 wording) |

## 5. Step-by-step instructions
1. In `env.ts` add
   `RATE_LIMIT_WORKSPACE_MULTIPLIER: z.coerce.number().int().min(1).default(10)` and mirror it in
   `.env.example` with a comment ("workspace ceiling = per-actor max × this factor").
2. In `RateLimitingMiddleware`:
   - Change `isRateLimited(tenantId, workspaceId, method, actor)` (add `actor: string`).
   - Key becomes `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}:${actor}`.
   - Extract a private `hit(key: string, limitMax: number)` doing the existing
     `INCR`/`EXPIRE`/`count > limitMax` logic and returning whether it is limited.
   - Enforce **both** buckets:
     `hit(actorKey, getRateLimitMax(method))` **or**
     `hit(workspaceKey, getRateLimitMax(method) * env.RATE_LIMIT_WORKSPACE_MULTIPLIER)`.
     A request is limited if either bucket is over its cap; evaluate the actor bucket first.
   - Update `resetRateLimit(tenantId, workspaceId, method, actor)` to delete the actor key
     (keep deleting the workspace key too if it already did; adjust the log fields).
   - Keep the "not connected → fail-open" guard and the fail-open `catch`.
3. In `rateLimitMiddleware`, build the actor:
   `const actor = req.user?.authorHash ?? req.ip;`
   (`req.ip` is the Fastify-provided remote address; anonymous/agent callers have no user.)
   Pass it to `isRateLimited`.
4. Update `docs/system/system_01` NFR-08 to read: *per-actor bucket (author hash when
   authenticated, IP otherwise) plus a coarse per-workspace ceiling*, and note the multiplier.

## 6. Constraints & gotchas
- Do **not** key only on `req.ip`: behind a proxy all callers would share it and the fairness
  problem returns. `authorHash` is the primary key.
- Do not add a new Redis dependency or a second connection.
- The `429` response shape (`ERR_RATE_LIMIT_EXCEEDED`) must stay identical.
- Keep existing log fields and add `actor` (never log the raw IP at info level if it is
  considered PII — log it only in the warn for the exceeded case, as today's fields are).

## 7. Acceptance criteria
- [ ] Two different `authorHash` values in the same workspace have **independent** buckets.
- [ ] A single actor over the per-actor max gets 429; other actors in the workspace are unaffected.
- [ ] The workspace multiplier ceiling still bounds total traffic.
- [ ] `RATE_LIMIT_WORKSPACE_MULTIPLIER` is validated in `env.ts` and present in `.env.example`.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "actor" apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-26` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Distributed sliding-window / token-bucket algorithms.
- Per-route or per-tier quotas (not specified).
