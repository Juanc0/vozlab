# ADR-0023: The Relator proposes edges; merges wait for a merge contract

- Status: Accepted
- Date: 2026-10-19
- Amended by: [ADR-0026](ADR-0026-merge-contract.md) — the merge contract now
  exists, so §2's interim behaviour (the `MERGE` verdict is logged, not
  applied) is replaced by a merge proposal. The rest of the decision stands.

## Context

The Relator asks a local LLM for one of three verdicts for a new node:
`MERGE` (the node duplicates an existing one), `EDGE` (the node is related to
an existing one) or `INDEPENDENT` (no action).

The Relator spec insists that the worker "never creates edges or mutates
nodes directly" and that it should always submit through
`POST /api/v1/proposals`. The current proposal contract cannot express either
verdict:

- `CreateProposalSchema` is an **edit** proposal: `targetId` must point at an
  existing node, edge or ontology class, and `proposedChanges` is a delta that
  is applied to that target. There is no way to say "create a new edge A→B"
  (the target does not exist yet) and no way to say "node X should be merged
  into node Y" (a merge is a status transition plus a re-pointing of the
  node's edges, not an attribute delta).
- `POST /api/v1/edges` already exists and creates an edge in `PENDING` state
  after validating the relation against the ontology's domain/range. A
  `PENDING` edge is the same governance state a proposal would produce: the
  edge is not visible as accepted until it is reviewed.

The alternatives were:

- **Extend the proposal contract** with a `kind` union (`EDIT` / `CREATE_EDGE`
  / `MERGE`), new target resolution and new review semantics. This is the
  "right" long-term model, but it changes the shared Zod contract, the domain
  entity, the repository, the resolution logic **and** the PWA review screen
  that does not exist yet. Doing it inside the Relator milestone would put two
  features in one batch and leave the review UI without a contract to render.
- **Use `POST /api/v1/edges` for the EDGE verdict** and leave MERGE
  unimplemented.
- **Add a dedicated merge endpoint now.** A merge mutates a node's status
  (`ACTIVE -> MERGED`) and its edges; there is no merge operation anywhere in
  the codebase, no proposal type for it and no review flow.

## Decision

### 1. The EDGE verdict creates a `PENDING` edge through `POST /api/v1/edges`

The Relator calls the existing, tested edge route with its agent token. The
edge is born `PENDING`, so governance still applies; the API validates the
relation against the ontology's domain/range and publishes `EDGE_CREATED`.

The worker picks the `relationKey` itself, from the workspace ontology
(`GET /api/v1/ontology`): it selects an **active object property whose domain
matches the source node's class and whose range matches the target node's
class**. If no property matches, the worker takes no action (the LLM wanted a
relation the ontology cannot express). The API remains the authority: it
re-validates the domain/range and rejects anything inconsistent with `422`.

### 2. The MERGE verdict is recorded, not executed

`MERGE` has no contract to submit to. Until one exists (a merge proposal type
plus the domain operation that re-points edges), the Relator:

- does **not** create or mutate anything;
- logs the verdict, the merge target and the LLM's reason at `info` level, so
  the information is auditable and can be replayed later;
- acknowledges the entry (there is nothing to retry).

This is a deliberate, documented gap: no merge is silently applied, and no
merge is silently lost either — it is in the log.

### 3. The LLM verdict is validated before anything is written

- The JSON must parse and match `{ action, targetId, reason }`.
- `action` must be one of `MERGE | EDGE | INDEPENDENT`.
- `targetId` must be one of the neighbour ids the API returned. A
  hallucinated target is **rejected** and treated as a retryable model
  failure (the entry stays pending, is retried and ends in the dead-letter
  stream if the model keeps hallucinating) — it is never turned into a write
  and never silently ignored.

## Consequences

### Positive

- The Relator can ship without inventing a proposal format, and the edges it
  creates are reviewed like any other `PENDING` edge.
- The ontology stays the single source of truth for relation keys: the worker
  proposes a key that exists, the API validates it again.
- The merge gap is explicit, logged and reviewable instead of being an
  accidental silent no-op.

### Negative / costs

- The Relator creates edges through the edge route, not through
  `POST /api/v1/proposals`, so the spec's "always use the proposal API" rule
  is deliberately broken here. The governance state (`PENDING`) is preserved.
- A merge verdict is not actionable yet: the value of the LLM's merge
  judgement is only in the log until a merge contract exists.
- The proposal contract still cannot express edge creation or merges; that
  work is still open and now has a decision to point at.

## Links

- [Relator spec](../components/relator.md) — the flow this decision serves.
- [ADR-0022 neighbour lookup](ADR-0022-relator-neighbour-lookup.md) — where the
  candidate set comes from.
- [ADR-0009 API-owned source registry](ADR-0009-api-owned-source-registry.md) —
  the same principle: the API owns the contract, the worker proposes.
- [FR-19](../requirements.md) — the requirement being implemented.
- [ADR-0026 merge contract](ADR-0026-merge-contract.md) — the contract §2 was
  waiting for.
