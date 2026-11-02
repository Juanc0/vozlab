# ADR-0024: Node ingestion stays one node per request

- Status: Accepted
- Date: 2026-10-19

## Context

`BatchCreateNodeSchema` exists in `@vozlab/shared-types`: 1 to 1000 nodes,
each validated by `CreateNodeSchema`. It was written as a contract so the
Extractor and the API would agree on a payload shape "when batch ingestion is
wired in". The Phase 2 kickoff list asked for a decision: batch endpoint
(`POST /api/v1/nodes/batch`) versus a single-node loop.

The facts that matter:

- The Extractor's contract is **one record per stream entry**. The worker
  masks PII, extracts one node and creates it; a failed record must be
  retried or dead-lettered on its own. A batch of 1000 nodes is either one
  transaction (one bad record loses the other 999) or 1000 statements with
  partial success and no per-item result to report.
- The rate limiter counts **requests**, not nodes (NFR-08: 30 writes/min per
  actor, with a workspace ceiling of 10x). A `POST /nodes/batch` with 1000
  nodes in the body would therefore be a one-request write of 1000 nodes — a
  direct bypass of the abuse budget the per-actor limit exists to enforce.
  A batch endpoint is only safe if the limiter counts the nodes in the body,
  which is a change to the abuse model, not a route.
- `CreateNodeUseCase` publishes `NODE_CREATED` per node after the
  transaction commits. A batch would publish N events, and the failure of one
  publication is best-effort by design — the same property, just N of them.
- The Extractor is rate limited like every other writer: at 30 writes/min per
  agent actor, bulk ingestion is throttled whatever the route looks like. The
  real constraint is the **agent write budget**, not the payload shape.

## Decision

**There is no batch node endpoint.** The only write path for nodes stays
`POST /api/v1/nodes`, one node per request, and the Extractor loops.

- `BatchCreateNodeSchema` remains a **contract, not a route**. It is kept in
  `packages/shared-types` so a future import job can agree on a shape, and
  the API reference keeps listing batched ingestion as "not implemented".
- Ingestion throughput is bounded by the write budget of the calling actor.
  Raising the budget for trusted system agents is a separate decision about
  the abuse model (NFR-08), not a consequence of a payload shape.
- When bulk ingestion is actually needed (a historical import, a connector
  that delivers thousands of records at once), it is an **import job** with
  its own budget, its own per-item result and its own decision record — not
  a bulk write on the public node route.

## Consequences

### Positive

- One write path, one rate-limit unit, one transaction per node, one event
  per node. Retries and dead-lettering stay per record.
- The abuse budget cannot be bypassed with a large body.
- No partial-success contract to design, document and teach.

### Negative / costs

- A connector that delivers thousands of records at once is limited by the
  per-actor write budget. That is a real limitation, and it is visible
  instead of hidden behind a bulk route.
- The unused schema stays in the shared package; a reader may wonder whether
  a route exists. The API reference and the schema's own comment say it does
  not.

## Links

- [ADR-0008 cross-workspace 404](ADR-0008-cross-workspace-404.md) — the write
  path's isolation rules.
- [Extractor spec](../spec/extractor.md) — the one-record-per-entry contract.
- [ADR-0021 worker runtime](ADR-0021-python-worker-runtime.md) — the retry and
  dead-letter model that a per-record loop relies on.
- [FR-17](../requirements.md) — the ingestion requirement.
