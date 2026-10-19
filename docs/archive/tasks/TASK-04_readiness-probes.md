# TASK-04 — Real `/health/ready` Dependency Probes

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-01 · **Size:** S
> **Self-contained:** yes.

## 1. Context
`docs/devops/devops_02_observability_and_logs.md` §3 defines:
- `GET /health/live` → `200 { "status": "alive" }` (process is up).
- `GET /health/ready` → verifies **active connectivity to PostgreSQL and Redis**; returns
  `200 { "status": "ready", "checks": { "database": "up", "redis": "up" } }`, otherwise `503`.

The current `HealthController.ready` is **decorative**: it calls
`routerDb.findTenantByOidcId('__healthcheck__')`, but `RouterDatabaseClient.findTenantByOidcId`
catches every error and returns `null`. So a Postgres outage still reports `routerDb: 'ok'`.
The Redis probe likewise reports healthy when the client is simply not connected.

Relevant files:
- `apps/api/src/domain/ports/IRouterDatabase.ts` (port)
- `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts` (adapter)
- `apps/api/src/infrastructure/events/RedisTokenBlacklist.ts`
- `apps/api/src/infrastructure/http/controllers/HealthController.ts`
- `apps/api/src/infrastructure/http/routes.ts` (already wires `/health`, `/health/live`, `/health/ready`)

## 2. Objective
Make `/health/ready` genuinely fail (503) when the Router DB or Redis is unreachable, and
return the documented payload shape.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` stays pure — the new port methods must not import Drizzle/pg/redis.
- `pnpm turbo run build` must pass.
- Health endpoints are **public** (no auth guards).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/domain/ports/IRouterDatabase.ts` |
| Edit | `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts` |
| Edit | `apps/api/src/infrastructure/events/RedisTokenBlacklist.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/HealthController.ts` |

## 5. Step-by-step instructions
1. Add to `IRouterDatabase`:
   ```ts
   /** Cheap liveness probe for the router database. MUST throw on failure. */
   ping(): Promise<void>;
   ```
2. Implement `ping()` in `RouterDatabaseClient` by executing a trivial query through Drizzle,
   e.g. `await this.db.execute(sql`SELECT 1`)` (import `sql` from `drizzle-orm`). It must
   **throw** on failure (do not swallow the error).
3. Add to `RedisTokenBlacklist`:
   ```ts
   /** Ping Redis. MUST throw when the connection is down. */
   ping(): Promise<void>;
   ```
   Implement with the Redis `PING` command; if `!this.connected` throw an Error.
4. Rewrite `HealthController.ready` to:
   - run `routerDb.ping()` in a try/catch → `database: 'up' | 'down'`;
   - run `tokenBlacklist.ping()` in a try/catch → `redis: 'up' | 'down'`;
   - respond `200 { status: 'ready', checks }` only when both are `'up'`, else
     `503 { status: 'degraded', checks }`.
   Keep `live()` returning `{ status: 'alive' }`.
5. Leave the route wiring in `routes.ts` unchanged (it already registers all three endpoints).

## 6. Constraints & gotchas
- Do not add a DB round-trip heavier than `SELECT 1`; readiness must stay cheap.
- Do not leak connection strings or stack traces in the response body.
- `HealthController` is constructed in `routes.ts` with `(routerDb, tokenBlacklist)` — keep
  that constructor shape.

## 7. Acceptance criteria
- [ ] `IRouterDatabase` declares `ping()`, implemented by `RouterDatabaseClient` and throwing on error.
- [ ] `RedisTokenBlacklist.ping()` throws when Redis is down.
- [ ] `/health/ready` returns `200` with the documented shape when both are up, and `503` when either is down.
- [ ] `/health/live` still returns `200 { status: 'alive' }`.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
# Manual (requires env):
pnpm --filter @vozlab/api dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health/ready   # 200
docker compose stop postgres
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health/ready   # 503
docker compose start postgres
```

## 9. Definition of done / handoff
- Build passes and the manual 200/503 check behaves as described.
- Mark `TASK-04` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Deep dependency checks (AGE, Ollama, pool saturation), metrics, or alerting.
