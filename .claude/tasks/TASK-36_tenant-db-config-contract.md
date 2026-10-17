# TASK-36 — Tenant DB Config: Null-vs-Throw Contract + Caller Audit

> **Batch:** Phase 1T.1 (Correctness) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TASK-30 changed `RouterDatabaseClient` so a **driver error** throws `InfrastructureError` while a
**missing row** still returns `null`. The executor flagged a consequence:

> `ConnectionPoolManager` consumes `getTenantDatabaseConfig`, which now throws instead of returning
> `null`. That's the intended 5xx path, but if any caller relied on the old null-means-absent
> behaviour it would surface as an error.

`ConnectionPoolManager.getDb` still branches on `if (!config) throw new DomainError('ERR_TENANT_NOT_PROVISIONED')`.
That branch is now reachable **only** for a genuinely missing `tenant_connections` row, which is
correct — but nothing pins the contract, and `getDb` is called from every repository, so an
open-coded `try/catch` around it could regress the mapping.

## 2. Objective
Audit every caller of `getTenantDatabaseConfig` / `ConnectionPoolManager.getDb`, state the intended
contract in code, and pin it with a test so a future `null`-swallow cannot reintroduce "403 instead
of 503".

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Infra failure → 5xx (`503 ERR_DATABASE_CONNECTION_FAILED`); missing row → the existing
  403 `ERR_TENANT_NOT_PROVISIONED` path.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/domain/ports/IRouterDatabase.ts` (doc-comment the two outcomes) |
| Edit | `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts` (doc-comment) |
| Edit | `apps/api/src/infrastructure/persistence/ConnectionPoolManager.ts` (doc-comment + branch note) |
| Create | `apps/api/tests/infrastructure/ConnectionPoolManager.test.ts` |

## 5. Step-by-step instructions
1. `grep -rn "getTenantDatabaseConfig\|getDb(" apps/api/src` and list every call site. For each,
   confirm there is no `catch` that converts an `InfrastructureError` into `null`/403.
2. Document on `IRouterDatabase.getTenantDatabaseConfig`:
   - returns `null` **only** when no `tenant_connections` row exists (legitimate);
   - throws `InfrastructureError('ERR_DATABASE_CONNECTION_FAILED')` on a driver/connection failure.
   Mirror one line on `findTenantByOidcId`.
3. In `ConnectionPoolManager.getDb`, keep the `DomainError('ERR_TENANT_NOT_PROVISIONED')` branch for
   the `null` case, and add a comment that an `InfrastructureError` from the call **must propagate**
   (never be caught here).
4. Add `ConnectionPoolManager.test.ts` with a fake `IRouterDatabase`:
   - config present → `getDb` returns a client and caches it (second call does not re-query);
   - `getTenantDatabaseConfig` resolves `null` → throws `DomainError` with
     `ERR_TENANT_NOT_PROVISIONED`;
   - `getTenantDatabaseConfig` rejects with `InfrastructureError('ERR_DATABASE_CONNECTION_FAILED')`
     → `getDb` rejects with the **same** error (not wrapped, not swallowed).
   Note: `drizzle(pool)` constructs a `pg` `Pool` but does **not** connect until a query runs, so
   this test needs no database. Close any pool in the fake/`finally` if one was created.

## 6. Constraints & gotchas
- Do **not** change the guard's mapping logic (TASK-30 owns it).
- Do **not** add retries/circuit breakers.
- Keep the `poolCount`/TTL behaviour untouched.

## 7. Acceptance criteria
- [ ] The two outcomes of `getTenantDatabaseConfig` are documented on the port.
- [ ] An `InfrastructureError` thrown by the router client is re-thrown unchanged by `getDb`.
- [ ] `null` still yields `ERR_TENANT_NOT_PROVISIONED`.
- [ ] `pnpm --filter @vozlab/api test` passes, including the new file.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "getTenantDatabaseConfig" apps/api/src
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-36` `[x]` in `TODO.md` with a one-line result note listing the
  audited call sites.

## 10. Out of scope
- The graceful-shutdown path (TASK-30).
- Readiness probes (TASK-04).
