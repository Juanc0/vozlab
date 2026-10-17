# TASK-30 — Infra Error Mapping (503 not 403) + Graceful Shutdown

> **Batch:** Phase 1S.1 (Correctness) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Two production-readiness defects confirmed in the Phase-1R review:

1. **M-2 — infra failure masquerades as authorization.** `RouterDatabaseClient.findTenantByOidcId`
   catches **every** error and returns `null`. `tenantWorkspaceGuard` treats `null` as "tenant not
   provisioned" → `403 ERR_TENANT_NOT_PROVISIONED`. So a Postgres outage answers 403 (a client
   error) instead of `503 ERR_DATABASE_CONNECTION_FAILED`, and monitoring never sees the outage.
   `getTenantDatabaseConfig` has the same swallow.
2. **L-3 / shutdown.** `index.ts` has no `SIGINT`/`SIGTERM` handler, so the `onClose` hook that
   disconnects Redis, stops the pool cleanup interval and closes pg pools never runs on deploy.

## 2. Objective
Distinguish "not found" (a legitimate `null`) from "infrastructure failed" (a throwable that maps
to 5xx), and shut the process down cleanly on termination signals.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Guard order stays `authGuard -> tenantWorkspaceGuard -> rateLimit`.
- Never leak raw driver errors/messages to the client — map to a stable `ERROR_CODES` entry.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/src/domain/errors/InfrastructureError.ts` |
| Edit | `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts` |
| Edit | `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/errorResponse.ts` |
| Edit | `apps/api/src/index.ts` |
| Edit | `apps/api/src/infrastructure/http/server.ts` (only if a shutdown helper is added) |

## 5. Step-by-step instructions
1. Create `apps/api/src/domain/errors/InfrastructureError.ts`:
   ```ts
   import type { ErrorCode } from '@vozlab/shared-types';

   /** A failure of an external dependency (DB/Redis), never a client mistake. */
   export class InfrastructureError extends Error {
     constructor(public readonly code: ErrorCode, detail?: string) {
       super(detail ? `${code}: ${detail}` : code);
       this.name = 'InfrastructureError';
     }
   }
   ```
2. In `RouterDatabaseClient`, replace the two `catch { return null }` blocks with
   `catch (err) { log.error(...); throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED'); }`.
   A **missing row** still returns `null` (that is the legitimate "not provisioned" case).
   Keep `ping()` throwing as-is.
3. In `tenantWorkspaceGuard`, wrap the `findTenantByOidcId` and `isMember` calls:
   ```ts
   try { tenant = await deps.routerDb.findTenantByOidcId(oidcTenantId); }
   catch (e) { const err = buildError(e instanceof InfrastructureError ? e.code : 'ERR_INTERNAL_SERVER_ERROR'); return reply.status(err.status).send({ code: err.code, message: err.message }); }
   ```
   Apply the same for the membership lookup (it hits the tenant DB). Keep the existing
   `ERR_TENANT_NOT_PROVISIONED` path for a genuine `null`.
4. `mapDomainError`: add
   `if (error instanceof InfrastructureError) return error.code;` before the `DomainError` branch
   (so controllers using `mapDomainError` also answer 503). Keep the unknown → 500 fallback.
5. **Shutdown.** In `index.ts` keep a module-level `app` reference and register:
   ```ts
   for (const signal of ['SIGTERM', 'SIGINT'] as const) {
     process.once(signal, () => {
       void (async () => {
         log.info({ signal }, 'shutting down');
         try { await app?.close(); process.exit(0); }
         catch (err) { log.error(err, 'shutdown failed'); process.exit(1); }
       })();
     });
   }
   ```
   Ensure `startServer()`'s returned `FastifyInstance` is the `app` used (it already returns it),
   and that the existing `onClose` hook in `server.ts` runs `tokenBlacklist.disconnect()`,
   `eventPublisher.disconnect()`, `rateLimiter.disconnect()`, `poolManager.stopCleanupInterval()`
   and `poolManager.destroyAll()`. Do not add a second disconnect path.

## 6. Constraints & gotchas
- `InfrastructureError` lives in `domain/errors/` but imports only a **type** from
  `@vozlab/shared-types` — no runtime coupling to Fastify/Drizzle/pg.
- Do not catch-and-swallow in the guard: an unexpected (non-`InfrastructureError`) throw maps to
  500, not 403.
- Do not change the 403 path for a genuinely unprovisioned tenant or a non-member.
- `app?.close()` must be idempotent-safe: `process.exit` after it; register with `process.once`.
- Keep the `log.fatal` + `process.exit(1)` in the startup `catch`.

## 7. Acceptance criteria
- [ ] A router-DB outage during a request → `503 ERR_DATABASE_CONNECTION_FAILED` (not 403).
- [ ] An unknown tenant still → `403 ERR_TENANT_NOT_PROVISIONED`.
- [ ] `SIGTERM` closes the app, disconnects Redis/pools, and exits 0.
- [ ] `RouterDatabaseClient` no longer returns `null` on a driver error.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "InfrastructureError" apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts apps/api/src/infrastructure/http/controllers/errorResponse.ts
grep -n "SIGTERM" apps/api/src/index.ts
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-30` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Readiness-probe behaviour (TASK-04 already returns 503 from `/health/ready`).
- Circuit breakers / retries around the DB.
- The `tx?: any` type debt.
