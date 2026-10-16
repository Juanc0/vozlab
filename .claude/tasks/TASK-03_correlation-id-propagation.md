# TASK-03 — Correlation ID (`reqId`) Propagation via AsyncLocalStorage

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-01 · **Size:** S–M
> **Self-contained:** yes.

## 1. Context
The observability spec (`docs/devops/devops_02_observability_and_logs.md`) requires a
**Correlation ID (`reqId`)** to be attached to **every** structured log line, propagated
through the whole request, and carried into Redis events for the Python workers.

The current implementation is broken. In
`apps/api/src/infrastructure/http/middlewares/CorrelationGuard.ts`:
```ts
withReqId(() => {
  req.log.info({ method: req.method, url: req.url }, 'incoming request');
}, reqId);
```
`withReqId` calls `AsyncLocalStorage.run(fn, id)` **synchronously**. As soon as the callback
returns, the store is gone. Every later `log.info(...)` in a controller, use case or
repository therefore calls `als.getStore()` and gets `undefined` — so `reqId` is missing from
every log except that single line.

Relevant files:
- `apps/api/src/shared/logger/index.ts` — exports `withReqId`, `getReqId`, `log`, `logger`.
- `apps/api/src/infrastructure/http/middlewares/CorrelationGuard.ts` — the hook.
- `apps/api/src/infrastructure/http/server.ts` — registers `correlationGuard` as an
  `onRequest` hook and sets `requestIdHeader: 'x-correlation-id'`, `genReqId: randomUUID`.

## 2. Objective
Make the AsyncLocalStorage context live for the whole request lifecycle so that **any**
`log.*` call during request handling automatically includes `reqId`.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `pnpm turbo run build` must pass.
- Fastify already generates/honours `x-correlation-id` and sets `request.id`. Build on that;
  do not invent a second correlation mechanism.
- Do not disable the `redact` configuration in the logger.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/shared/logger/index.ts` |
| Edit | `apps/api/src/infrastructure/http/middlewares/CorrelationGuard.ts` |

## 5. Step-by-step instructions
1. In `shared/logger/index.ts`, add and export a helper that **binds** the id to the current
   async context for the remainder of its lifetime:
   ```ts
   /** Bind the correlation id to the current async context (whole request). */
   export function bindReqId(id: string): void {
     als.enterWith(id);
   }
   ```
   Keep `withReqId` and `getReqId` unchanged (other code/tests may use them).
2. In `CorrelationGuard.ts`:
   - import `bindReqId` instead of (or in addition to) `withReqId`;
   - call `bindReqId(reqId)` as the **first** statement of the `correlationGuard` hook,
     before any logging;
   - set `req.reqId = reqId` as today;
   - emit the incoming-request log with the normal `req.log` (Fastify's logger) OR the shared
     `log` proxy — both must now carry `reqId`.
   Remove the old synchronous `withReqId(() => {...})` wrapper.
3. Confirm `sendCorrelationHeader` still echoes `X-Request-ID: <reqId>` back to the client.

## 6. Constraints & gotchas
- `AsyncLocalStorage.enterWith` sets the store for the current execution context and its
  descendants; in a per-request hook this is the standard Fastify+ALS pattern. Document the
  choice with a short comment (why `enterWith` and not `run`).
- Do not change how Fastify generates ids or the `requestIdLogLabel: 'reqId'` option.
- Repositories/use cases must keep using the shared `log` proxy so they benefit automatically.

## 7. Acceptance criteria
- [ ] `bindReqId` is exported from the logger module.
- [ ] The `onRequest` hook binds the id before any log call.
- [ ] Any `log.info(...)` invoked later in the request (controller/use case/repository)
      includes a `reqId` field in the emitted JSON.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
```
Manual end-to-end check (requires env + Redis):
```bash
pnpm --filter @vozlab/api dev
curl -s -H 'x-correlation-id: 11111111-1111-4111-8111-111111111111' http://localhost:3000/health/live
# Inspect the server stdout: the log line(s) must contain "reqId":"11111111-1111-4111-8111-111111111111"
```

## 9. Definition of done / handoff
- Build passes and the manual check shows `reqId` in the JSON logs.
- Mark `TASK-03` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Adding a full logging/metrics stack, tracing spans, or per-module log fields
  (`module`, `durationMs`) — that belongs to later observability work.
