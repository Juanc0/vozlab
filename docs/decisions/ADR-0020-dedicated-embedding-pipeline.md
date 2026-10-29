# ADR-0020: Dedicated embedding pipeline with agent-only write-back

- Status: Accepted
- Date: 2026-10-19

## Context

FR-18 requires the API to turn a node into a 768-dimensional
`nomic-embed-text` vector after the node transaction commits. The schema has
`public.nodes.embedding vector(768)` and the HNSW cosine index
`idx_nodes_embedding_hnsw`, and `CreateNodeUseCase` publishes `NODE_CREATED` to
`stream:node_created`. Nothing consumes that stream and nothing writes
`embedding` today, so the Relator's pgvector query is unusable.

Two rules constrain the design:

1. Workers are not allowed to write tenant PostgreSQL directly. Graph writes
   must pass through the API so ontology validation, workspace isolation,
   authorization and event publication stay in one place.
2. Embedding is not only for the Relator. Semantic search and the Consolidator
   need vectors too, and vectors must exist even when the Relator decides a node
   is independent.

The alternatives considered were:

- **Relator-inline embedding.** The Relator computes the vector before doing its
  top-5 search. This is the smallest process count, but it makes the Relator the
  only producer of a shared artifact, couples a slow Ollama call to relationship
  latency, and leaves no vector when the Relator skips a node.
- **API computes the embedding on node creation.** This keeps one process but
  contradicts NFR-03 (mutations should not wait on heavy model work) and makes
  Ollama availability part of the write path.
- **A dedicated embedder consumer that writes through an agent-only API
  endpoint.** This adds one process and one route, but isolates the model call,
  supports independent scaling and backfill, and preserves API-only writes.
- **A worker writing `nodes.embedding` directly with SQL.** This is the fastest
  path but breaks the API ownership rule and would bypass workspace checks,
  soft-delete rules and auditability.

## Decision

### 1. A dedicated embedder consumer owns vector generation

Add a dedicated embedder process (`apps/worker-embedder`; scaffolded in
milestone 2.1, handler implemented in 2.4). It consumes
`stream:node_created` with its own Redis consumer group, `embedder`. The
Relator keeps its own `relator` group on the same stream; Redis Streams
consumer groups fan the event out to both.

The embedder:

1. Reads the `NODE_CREATED` fields (`reqId`, `nodeId`, `workspaceId`, `typeKey`,
   `title`).
2. Calls the local Ollama embedding endpoint with `nomic-embed-text` and
   validates that the result is exactly 768 finite floats.
3. Writes the vector through the API, never through SQL.
4. Acknowledges only after a successful write.

The embedder is not one of the three AI agents (Extractor, Relator,
Consolidator). It is a preprocessing utility worker and has no LLM prompt,
proposal or graph authority.

### 2. Write-back is `PUT /api/v1/nodes/:id/embedding`, agent-only

The API adds:

```http
PUT /api/v1/nodes/:id/embedding
Authorization: Bearer <agent JWT type=AGENT_EMBEDDER>
X-Workspace-ID: <workspace uuid>
x-correlation-id: <reqId>
Content-Type: application/json

{
  "embedding": [0.013, -0.004, "… exactly 768 finite numbers …"],
  "model": "nomic-embed-text"
}
```

- The route uses the normal protected chain (`authGuard -> tenantGuard ->
  tenantWorkspaceGuard -> rateLimit`).
- It additionally requires the agent type `AGENT_EMBEDDER`; human actors and
  other agent types receive `403`.
- `AGENT_EMBEDDER` is added to `AgentTypeSchema` and the auth allowlist.
- The body is validated by Zod: exactly 768 numbers, all finite, and a model
  string matching the deployment's configured embedding model.
- The node lookup is scoped by `tid` and `X-Workspace-ID`; missing, foreign,
  soft-deleted or deleted nodes return `404` (ADR-0008).
- The write is an idempotent overwrite. Re-delivery of the same event may
  recompute and overwrite the vector without creating a second row.
- Success returns `204 No Content`. Errors use the existing error envelope:
  `422 ERR_VALIDATION_FAILED`, `403`, `404`, or `503`.
- The endpoint writes a vector, not a node/edge mutation. It does not create a
  proposal and does not change node status.

Milestone 2.4 also adds `embedding_model` and `embedded_at` to
`public.nodes` (nullable text/timestamptz). A vector is only meaningful for the
model that produced it; recording the model makes a future model change
auditable and lets readers exclude stale vectors. `nomic-embed-text` remains
the only accepted model in Phase 2.

### 3. Relator still consumes `NODE_CREATED` and retries until a vector exists

No `NODE_EMBEDDED` event is introduced in Phase 2. The Relator's handler checks
for `embedding IS NOT NULL` (and the current model). If the vector is not ready,
it raises a retryable error; the entry stays in the Pending Entries List and is
recovered with `XAUTOCLAIM`. After the bounded attempts it moves to the
dead-letter stream (ADR-0021). This matches the relator spec's "wait or queue"
rule and avoids adding a second event whose loss would also need handling.

If retry volume becomes material, a future ADR may add `NODE_EMBEDDED` or an
outbox; that is not part of Phase 2.

### 4. Failure and backfill policy

- Ollama unavailable, a timeout, a malformed vector, or a `5xx` from the API is
  retryable. The message remains pending and is recovered after the configured
  idle threshold.
- A `404` (node deleted or moved) or a `422` is permanent: log the reason and
  dead-letter the message instead of retrying forever.
- A `401/403` means worker credentials or the agent type are wrong; it is
  permanent and should be alerted, not retried.
- Backfill of existing nodes is an operator action using the same endpoint and
  a one-off scan; it is not part of the live `NODE_CREATED` consumer.

## Consequences

### Positive

- Node creation stays fast and independent of Ollama.
- Embeddings exist for every node that reaches the stream, not only for nodes
  the Relator chooses to evaluate.
- The API remains the only writer to tenant PostgreSQL; the new route is
  narrow, workspace-scoped and auditable.
- The embedder can be scaled, paused or backfilled without touching the
  Relator.

### Negative / costs

- One more process, one more consumer group, one more route and an
  `AGENT_EMBEDDER` credential to operate.
- The Relator can observe a node before its vector is ready and must leave the
  entry pending; a burst can grow the PEL until the embedder catches up.
- `embedding_model` adds schema surface and must be kept consistent with the
  worker's configuration.
- `NODE_CREATED` remains fire-and-forget: if Redis is down at publish time, no
  embedding is produced until a backfill. There is still no outbox.

## Links

- [FR-18](../requirements.md)
- [Relator spec](../components/relator.md)
- [Worker runtime decision](ADR-0021-python-worker-runtime.md)
- [API-only writes and Python worker conventions](../conventions.md#10-python-workers)
- [Soft-delete policy](ADR-0006-soft-delete-policy.md)
- [Cross-workspace 404](ADR-0008-cross-workspace-404.md)
