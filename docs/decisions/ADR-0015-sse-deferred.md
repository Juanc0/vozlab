# ADR-0015: SSE notifications deferred; REST polling is the interim

- Status: Deferred
- Date: 2026-10-19

## Context

The architecture and frontend documents describe real-time notifications to the PWA over Server-Sent Events (for example, a refresh after a graph change). The API currently exposes no SSE endpoint, no event-stream response and no notification channel. Redis Streams are used for internal events (`stream:node_created`), not for pushing to browsers.

## Decision

SSE is deferred. Clients read the REST API on demand and poll when they need fresher data. No partial SSE implementation is added: there is no half-built event stream, no separate notification transport and no client subscription protocol in this batch.

When SSE is built, it must reuse the same authentication and workspace scoping as the REST API, and it must define fan-out, backpressure, heartbeat and reconnect behavior.

## Consequences

### Positive

- The API stays request/response and stateless; no long-lived connections to manage.
- No additional Redis consumer, heartbeat or proxy configuration is needed now.
- The REST contract remains the only client integration surface.

### Negative / costs

- Updates are not pushed; the UI must choose a polling interval, which adds latency and repeated reads.
- Polling load grows with the number of open clients and can hide a real-time requirement until late.
- Adding SSE later needs a new auth path for long-lived connections and a workspace-scoped subscription model.

## Links

- `docs/archive/spec-v1/system/system_03_uml_and_deployment_diagrams.md` (SSE flow)
- `docs/archive/spec-v1/modules/modules_03_frontend_pwa_sveltekit.md` (SSE notifications)
- `apps/api/src/infrastructure/events/RedisEventPublisher.ts` (internal stream only)
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Deferred (SSE notifications)
- `.claude/reviews/REVIEW-2026-10-17_phase-1r.md` concern #2
