# ADR-0009: The API owns the data-source to workspace registry

- Status: Accepted
- Date: 2026-10-19

## Context

The Extractor spec originally had the ingestion envelope carry `workspace_id`, and the worker forwarded it as `X-Workspace-ID`. Nothing in the database or API mapped a source to a workspace, so the worker (or the gateway) was trusted to choose any workspace. There was no registry, no per-source audit, and no place to keep per-source behavior such as connector type or dedup window.

Three options were considered: keep the envelope-carried workspace, add an API-owned registry, or deploy one worker per workspace. The first is unauditable, the third has the highest operational cost.

## Decision

The API owns the `source_id -> workspace` mapping in a per-tenant `meta.data_sources` registry. The registry belongs to Phase 2 (Extractor integration); it is not built during the contract definition.

- `RawSourceRecord` carries `sourceId`, `connectorType`, `channelName` and `rawContent`. It has no `workspaceId`.
- The ingestion gateway or worker resolves the target through the API's resolution route. The worker never chooses a workspace and never asserts one in the payload.
- `meta.data_sources` is also the home of the per-source behavior profile (`BATCH`/`STREAM`, connector type), scoped by workspace inside the tenant.
- One worker codebase serves all sources; behavior is data, not a forked deployment.

## Consequences

### Positive

- The API remains the single authority for tenancy and ontology, and every ingest can be attributed to a provisioned source.
- A compromised or buggy worker cannot target an arbitrary workspace by editing the envelope.
- Per-source behavior can change without redeploying a worker.

### Negative / costs

- Phase 2 gains a table, a provisioning path and a resolution route before the first worker can run.
- The worker adds a resolution round-trip (or a cached mapping) to its ingest path.
- The API becomes a runtime dependency for source resolution; a cache/fallback policy is needed for availability.

## Links

- `packages/shared-types/src/schemas/ingestion.schema.ts`
- `docs/archive/spec-v1/modules/modules_05_ai_worker_extractor.md` §5
- `docs/components/extractor.md`
- `docs/archive/spec-v1/00_ARCHITECTURE_OVERVIEW.md` §6, edge case 3
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` — Phase 1T.4 and Deferred
- `docs/archive/reviews/REVIEW-2026-10-17_phase-1s.md` concern C2
- `docs/archive/tasks/TASK-41_datasource-workspace-mapping-decision.md`
