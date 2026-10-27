# ADR-0038: Ingestion stays in the API for the MVP; extraction to a dedicated gateway is deferred

- Status: Accepted (deferred extraction)
- Date: 2026-10-27
- Related: ADR-0009 (API owns source registry), ADR-0025 (source resolution route),
  ADR-0035 (ingestion gateway shape)

## Context

The ingestion producer (`POST /api/v1/ingestion/ingest`) currently lives inside
the Fastify API. It reuses auth, tenant resolution, the source registry and the
rate limiter. A separate service would duplicate all of that or call back to
the API, adding latency and a failure point. The question is whether ingestion
should be its own application.

## Decision

1. **Ingestion stays in the API for the MVP.** The `IngestSourceUseCase` is a
   hexagonal use case with injected ports (`IDataSourceRepository`,
   `IEventPublisher`), so the logic is not coupled to Fastify.
2. **Extraction to a dedicated `ingestion-gateway` service is deferred** until
   one of these triggers is met:
   - Ingestion volume saturates the API's rate budget.
   - A client requires ingestion to scale independently.
   - A client requires a dedicated endpoint with a different SLA.
3. **When extracted**, the gateway calls the API to resolve sources (ADR-0025)
   and publishes directly to `stream:source_raw`; the use case logic moves
   unchanged.

## Consequences

### Positive

- No duplicated auth/tenancy logic in the MVP.
- The use case is already extraction-ready (ports, not concretions).
- Simpler operations: one deployable, one health check.

### Negative / costs

- A bulk ingestion burst shares the API's request budget (mitigated by
  per-actor and per-workspace rate limits).
- The API carries ingestion load until extraction.

## Links

- `apps/api/src/application/use_cases/IngestSourceUseCase.ts`
- `apps/api/src/infrastructure/http/controllers/IngestionController.ts`
- `docs/decisions/ADR-0035-ingestion-gateway.md`
