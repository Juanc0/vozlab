# ADR-0035: Ingestion is a registry-backed gateway with PII masked before enqueue

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0009 (API owns source registry), ADR-0025 (source resolution route)

## Context

`meta.data_sources` and `GET /api/v1/ingestion/resolve-source` exist, but nothing
publishes `stream:source_raw` and there is no management route for the registry.
University systems need a controlled way to feed data into a workspace.

## Decision

1. **A management API for `meta.data_sources`** (maintainer/admin only) registers
   a source with `{ systemKey, displayName, kind, workspaceId, fieldMapping,
   piiPolicy }`. This is the routing/mapping intermediary and the single source
   of truth for "which external system feeds which workspace".
2. **An ingestion producer** (HTTP endpoint or worker-side adapter) accepts a raw
   payload + `sourceKey`, resolves the source via the existing route, validates
   the field mapping, masks PII locally, and `XADD`s to `stream:source_raw` with
   `{ tid, workspaceId, sourceKey, maskedPayload, correlationId }`.
3. **PII is masked before enqueue.** The producer reuses the Extractor's masker;
   raw PII never enters a stream or the database.
4. **Generic adapter first.** One JSON/CSV adapter ships with the gateway;
   per-university adapters are Phase 5 plugins.
5. **No direct DB writes from external systems.** All writes go through the API
   and the proposal flow.

## Consequences

### Positive

- Tenant-scoped, auditable, editable by maintainers.
- PII boundary is explicit and enforced before enqueue.
- Generic adapter unblocks the first demo without per-system work.

### Negative / costs

- Personal-name masking stays heuristic (NFR-06 Partial) — documented as a limit.
- One more route and worker-side component to maintain.

## Links

- `apps/api/src/infrastructure/http/routes.ts` (`/ingestion/resolve-source`)
- `docs/spec/extractor.md` (PII masking)
- `apps/worker-extractor/src/worker_extractor/pii.py`
