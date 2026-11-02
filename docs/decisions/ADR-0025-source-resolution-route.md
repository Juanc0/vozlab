# ADR-0025: Source resolution is an agent-only, tenant-scoped API route

- Status: Accepted
- Date: 2026-10-19

## Context

ADR-0009 decided that the API owns the `sourceId -> workspace` mapping in a
per-tenant `meta.data_sources` registry, and that the worker resolves the
target through an API route instead of asserting a workspace in the payload.
Milestone 2.2 builds that registry and that route. Two things were still
open:

- **Who may resolve?** A resolution returns the workspace a source belongs
  to. A human caller could use it to map arbitrary source ids to workspaces —
  a small but real enumeration surface that has no reason to be public.
- **Which headers does it take?** Every protected route today requires
  `X-Workspace-ID`, because the route acts *inside* a workspace. The
  resolution route is the exception: the worker does not know the workspace
  yet, that is what it is asking for. Requiring the header would be
  circular.

## Decision

### 1. The route

```http
GET /api/v1/ingestion/resolve-source?sourceId=<external id>
Authorization: Bearer <agent JWT>
```

```json
{ "sourceId": "minutes-2026-10", "workspaceId": "33333333-…", "connectorType": "MINUTES", "behaviorProfile": "BATCH" }
```

- The route runs `authGuard -> tenantGuard -> rateLimit`. It does **not** run
  `tenantWorkspaceGuard`, because the workspace is the answer, not an input.
- `tenantGuard` resolves the physical tenant database from the `tid` claim,
  so the lookup is scoped to the caller's tenant: a source of another tenant
  is not visible, and the answer can only ever be a workspace of the caller's
  own tenant.
- It is **agent-only**: a human token gets `403 ERR_AUTHORIZATION_FAILED`.
  The allow-list is every `AGENT_*` type (not only `AGENT_EXTRACTOR`), because
  the mapping is tenant plumbing that any ingestion-capable worker may need;
  a single type can be tightened later without changing the contract.
- An unknown or inactive source answers `404 ERR_DATA_SOURCE_NOT_FOUND` — the
  same "existence is not leaked" rule as every other resource
  (ADR-0008).

### 2. The registry

`meta.data_sources` (tenant database, per workspace):

| Column | Notes |
| --- | --- |
| `id` | uuid, primary key |
| `workspace_id` | uuid → `auth.workspaces.id` |
| `source_key` | the external `sourceId`; unique per workspace |
| `connector_type` | `MINUTES` / `SURVEY` / `INBOX` / `OPEN_COMMENT` |
| `behavior_profile` | `BATCH` / `STREAM` — ADR-0009's per-source behavior |
| `display_name` | human label |
| `status` | `ACTIVE` / `INACTIVE`; only `ACTIVE` sources resolve |
| `created_at`, `updated_at` | timestamps |

The resolution is **one lookup by `source_key` inside the caller's tenant**,
returning the owning workspace. The same `source_key` may exist in two
workspaces of the same tenant; the resolution returns the first `ACTIVE`
match and the uniqueness constraint is per `(workspace_id, source_key)`, not
global. (A future decision may make `source_key` unique per tenant.)

### 3. Provisioning is not in this milestone

The registry has **no management route yet**: no create, no activate, no
deactivate. The table plus the resolution route is what milestone 2.2
delivers; the rows are inserted by an operator (or by the future ontology-style
propose/activate flow). The dev seed provisions one example source so the
route can be exercised locally.

## Consequences

### Positive

- The worker cannot choose a workspace, and a human cannot enumerate the
  mapping.
- The route resolves the tenant from the token, so the answer can only be a
  workspace of the caller's own tenant — the physical isolation of ADR-0002
  is preserved.
- The per-source behavior profile lives with the source, so a connector
  change is data, not a redeploy.

### Negative / costs

- The API becomes a runtime dependency for source resolution; ADR-0009 already
  requires a cache/fallback policy for availability, and no cache exists in
  the worker yet.
- One more route, one more table, one more error code.
- Until a management route exists, the registry can only be filled by an
  operator; the Extractor has nothing to resolve in a fresh tenant.

## Links

- [ADR-0009 API-owned source registry](ADR-0009-api-owned-source-registry.md) —
  the decision this implements.
- [ADR-0008 cross-workspace 404](ADR-0008-cross-workspace-404.md).
- [Extractor spec](../spec/extractor.md) — the consumer of the route.
- [FR-17](../requirements.md) — the ingestion requirement.
