# ADR-0022: The Relator reads neighbours through the API, not the database

- Status: Accepted
- Date: 2026-10-19

## Context

The Relator (Agent 2) must compare a new node with the closest active nodes
in its workspace before it can propose a relationship. The algorithm is a
pgvector cosine search (`<=>`) over `public.nodes.embedding`, scoped to the
workspace, top 5.

The Relator spec ([spec/relator.md](../components/relator.md)) describes the worker
loading the node and running the query **directly against the tenant
database**, read-only. That contradicts two decisions already in force:

- The API is the only client of tenant PostgreSQL. Physical isolation is
  implemented by handing each tenant its own database and resolving a pool per
  `tid`; a worker that opens its own connection would need tenant database
  credentials, and the workspace/soft-delete/status filters would be
  re-implemented in Python.
- ADR-0020 keeps the worker out of the database: the embedder writes vectors
  through an agent-only route for exactly the same reason.

The alternatives considered were:

- **Give the Relator a read-only tenant DB connection.** Closest to the spec
  text and the fastest path, but it distributes tenant credentials to a
  process, duplicates the tenancy filters in a second language and bypasses
  the API's read path (which is where workspace isolation is enforced today).
- **Expose a vector-search endpoint on the API.** The API resolves the tenant,
  loads the source node, runs the HNSW-backed query with the workspace,
  soft-delete and status filters, and returns the candidates. The worker never
  sees a connection string, a row of another workspace or a deleted node.
- **Ship the neighbours in the `NODE_CREATED` event.** Impossible: the event is
  published before the node is embedded, and the event carries no vectors.

## Decision

The API exposes a **workspace-scoped neighbour lookup**:

```http
GET /api/v1/nodes/:id/neighbors?limit=5
Authorization: Bearer <jwt>
X-Workspace-ID: <workspace uuid>
```

```json
{
  "node": { "id": "…", "typeKey": "Problem", "title": "…", "description": "…", "status": "PENDING" },
  "neighbors": [
    { "id": "…", "typeKey": "Idea", "title": "…", "description": "…", "status": "ACTIVE", "similarity": 0.83 }
  ]
}
```

- The route uses the normal protected chain (`authGuard -> tenantWorkspaceGuard
  -> rateLimit`). It is a **read**: any member of the workspace may call it
  (the PWA will use it for "related nodes"), and the Relator calls it as an
  agent. It is not agent-only.
- `limit` is clamped to 1..10 and defaults to 5 (the spec's top-5).
- The query is workspace-scoped and excludes soft-deleted rows, rows without a
  vector and rows whose status is not in the allow-list `('ACTIVE','PENDING')`
  (so `REJECTED`, `MERGED` and `DEPRECATED` can never be proposed as
  neighbours). The source node is excluded.
- `similarity` is `1 - (embedding <=> source.embedding)`.
- The lookup needs the source node's own vector. When the node exists but has
  **no embedding yet**, the route answers `409 ERR_NODE_NOT_EMBEDDED` instead
  of an empty list. This is what makes ADR-0020's "wait for the vector"
  rule explicit and machine-readable: the Relator maps `409` to a retryable
  failure, leaves the stream entry pending and lets `XAUTOCLAIM` bring it back
  once the embedder has written the vector.
- A missing, foreign or soft-deleted source node is `404 ERR_NODE_NOT_FOUND`
  (ADR-0008 — existence is not leaked).

The Relator keeps its own consumer group (`relator`) on
`stream:node_created`, so it and the embedder both see every event.

## Consequences

### Positive

- One implementation of the tenancy, soft-delete and status filters; the
  worker cannot accidentally propose a deleted or foreign node.
- The Relator needs no database credentials — only the API base URL and an
  agent token, exactly like the embedder.
- The endpoint is reusable by the PWA ("what is related to this node?").
- The `409` contract turns "wait for the embedding" into an explicit,
  retryable state instead of an ambiguous empty result.

### Negative / costs

- One more endpoint and one more read path to maintain.
- The Relator now depends on two API calls (neighbours + ontology) before it
  can act; the latency budget per node grows slightly.
- The similarity is computed inside the tenant database, so the API pays for
  the vector search. With a small table the planner may prefer a sequential
  scan over the HNSW index — a cost decision, not a defect (NFR-02 is still
  unmeasured at 100k vectors).
- A workspace member can now probe the vector index; the read rate limit
  (300/min per actor) is the only guard.

## Links

- [ADR-0020 embedding pipeline](ADR-0020-dedicated-embedding-pipeline.md) — the
  embedder that produces the vectors this query searches.
- [ADR-0021 worker runtime](ADR-0021-python-worker-runtime.md) — the consumer
  and retry model that turns `409` into "leave it pending".
- [Relator spec](../components/relator.md) — the algorithm this endpoint serves.
- [ADR-0008 cross-workspace 404](ADR-0008-cross-workspace-404.md).
