# ADR-0026: A merge is a proposal kind, applied by the API

- Status: Accepted
- Date: 2026-10-19
- Supersedes: nothing. It completes [ADR-0023](ADR-0023-relator-edge-and-merge-semantics.md), whose §2 said the `MERGE` verdict waited for a merge contract.

## Context

ADR-0023 let the Relator create a `PENDING` edge for the `EDGE` verdict but
could only *log* the `MERGE` verdict, because the proposal contract cannot
express a merge:

- `CreateProposalSchema` is an **edit** proposal: `targetId` points at an
  existing node, edge or ontology class and `proposedChanges` is a delta that
  is applied to that target.
- A merge is not a delta. It is a status transition of one node
  (`PENDING|ACTIVE -> MERGED`), a pointer from the merged node to the node
  that survives, and a re-pointing of the merged node's edges.

ADR-0023 named two options for the long term: extend the proposal contract
with a `kind` union, or add a dedicated merge endpoint. The third option —
overloading `proposedChanges` with a magic key such as `mergeIntoNodeId` — was
never written down but is the one that is cheapest and worst: an edit delta
and a merge would be indistinguishable, so any future field named like that
would silently become a merge.

Two further facts shaped the decision:

1. **There is no node-activation path.** `POST /api/v1/nodes` creates every
   node in `PENDING` and no route moves it to `ACTIVE`, so `ACTIVE -> MERGED`
   (the only merge transition in the state machine) is unreachable in
   practice. A merge contract that only accepted `ACTIVE` nodes would be
   unusable: every node the ingestion pipeline produces is `PENDING`.
2. **The proposal resolution path is shared.** `ApproveProposalUseCase` and
   `AutoApplyProposalUseCase` both call `applyProposalDelta` inside one
   transaction. A merge has to be applied by the same path, atomically with the
   proposal status change, or the graph and the governance record would drift
   apart.

The alternatives were:

- **A dedicated `POST /api/v1/merges` endpoint** with its own table and its
  own review flow. Two governance entities for one concept; the PWA (not
  built yet) would have to render and resolve two different things.
- **Overloading `proposedChanges`.** No schema change, but the kind of a
  proposal becomes a guess.
- **Extending the proposal contract with an explicit `kind`** and letting the
  existing resolution path dispatch on it. One governance entity, one review
  screen, one state machine — at the price of touching the shared Zod
  contract, the domain entity, the repository and the resolution logic.

## Decision

### 1. The proposal contract gains an explicit `kind`

`CreateProposalSchema` becomes a discriminated union on `kind`:

| `kind` | `targetType` | `proposedChanges` |
| --- | --- | --- |
| `EDIT` (default) | `NODE` \| `EDGE` \| `ONTOLOGY` | a delta, as today |
| `MERGE` | `NODE` only | `{ mergeIntoNodeId: <uuid> }` |

`kind` is stored in a new `public.edit_proposals.kind` column (default
`'EDIT'`), so the kind of an existing proposal is never a guess. A request
without `kind` is still an `EDIT` proposal: the contract stays backwards
compatible.

### 2. The target of a merge proposal is the node that disappears

`targetId` is the **duplicate** (the node that will be merged away) and
`proposedChanges.mergeIntoNodeId` is the **survivor** (the node that keeps
living). The proposal's target is therefore the entity that mutates, which
keeps FR-12 meaningful: the target's maintainer is the one who resolves the
proposal.

### 3. Validation happens when the proposal is created

`POST /api/v1/proposals` with `kind: 'MERGE'` is rejected unless:

- `mergeIntoNodeId` is a UUID and differs from `targetId` (`422`);
- the duplicate exists in the request workspace (`404 ERR_NODE_NOT_FOUND`);
- the survivor exists in the request workspace (`404 ERR_NODE_NOT_FOUND` —
  existence is never leaked, ADR-0008);
- the duplicate is in a mergeable state (`PENDING` or `ACTIVE`; `MERGED`,
  `DEPRECATED` and `REJECTED` are terminal) — otherwise `422
  ERR_INVALID_STATE_TRANSITION`;
- the survivor is not itself `MERGED` — otherwise `422
  ERR_INVALID_STATE_TRANSITION`;
- the duplicate has no other pending merge proposal — otherwise `409
  ERR_DUPLICATE_PROPOSAL`. A node can only be merged away once.

### 4. The merge is applied by the API, atomically with the approval

When the proposal is approved (or auto-applied), the API applies the merge
inside the same transaction that flips the proposal status:

- the duplicate becomes `MERGED` and records `merged_into_id` (the survivor);
- the survivor absorbs the attributes the duplicate has and the duplicate does
  not — **the survivor's own values always win** — and inherits the
  duplicate's community score;
- the duplicate's edges are re-pointed to the survivor: an edge whose other
  end is the duplicate now starts (or ends) at the survivor. A self-loop of
  the duplicate and any edge that would duplicate an existing edge of the
  survivor (same relation key) are soft-deleted instead of re-pointed.

The state rules are checked **twice**: when the proposal is created and again
when it is applied, because a node can change in between. Without the second
check, two nodes that each propose to absorb the other could both be
approved and the graph would end up with no survivor at all — a merge cycle.
The second half of such a cycle is refused with `422
ERR_INVALID_STATE_TRANSITION`.

The merge is a **domain operation**, not a SQL script: `Node.mergeInto` and
`Node.absorb` own the transition and the rules, the repositories only
persist what the entity decided.

`PENDING -> MERGED` is added to the node state machine, because `PENDING` is
the only state a node can be in today (see Context).

### 5. The embedding of a merged node is left alone

The duplicate keeps its vector. `MERGED` nodes are excluded from the
neighbour lookup (`status IN ('ACTIVE','PENDING')`, ADR-0022) and the row
stays as the audit trail of what the duplicate said. No worker recomputes it:
the embedder only reacts to `NODE_CREATED`.

### 6. The resolution rules do not change

FR-12 keeps its exclusive power: the **duplicate's author** approves or
rejects. A moderator may still auto-apply after 14 days with a community
score of 10 or more (FR-13).

For the pipeline's own nodes this has a consequence worth stating plainly: the
duplicate was created by an agent, so the *agent* is its author, and a human
cannot approve the proposal. The human path for a merge proposed by the
Relator is therefore the one the governance model already provides: the
community votes on the proposal and a moderator applies it. The merge
contract does not invent a second, faster path for agents.

### 7. The Relator submits the merge proposal

The `MERGE` verdict now calls `POST /api/v1/proposals` with `kind: 'MERGE'`,
`targetId` = the new node and `mergeIntoNodeId` = the neighbour the model
chose. The verdict is no longer only a log line, and the Relator finally
follows the spec's "always submit through the proposal API" rule for merges.
The `EDGE` verdict is unchanged (ADR-0023 §1): a `PENDING` edge through
`POST /api/v1/edges`.

## Consequences

### Positive

- FR-19 can be closed: the Relator proposes edges *and* merges, both through
  the governance path.
- One governance entity: the PWA review screen renders a proposal, not a
  proposal and a merge request.
- The kind is explicit in the database, in the contract and in the API
  response, so no consumer has to infer it from the payload shape.
- The merge is auditable: the duplicate stays in the table with its pointer
  to the survivor.

### Negative / costs

- The shared Zod contract changed: `CreateProposalSchema` is now a union, so
  `z.infer` gives a discriminated type and every consumer of the old shape
  has to be revisited (the API is the only consumer today; the PWA does not
  exist yet).
- Two columns were added (`edit_proposals.kind`, `nodes.merged_into_id`) and
  the node state machine grew a transition.
- A merge is **not** applied by an agent: it needs the governance path, which
  for agent-created nodes means votes plus a moderator. That is slower than
  letting the Relator merge directly, and it is deliberate — a bot that
  deletes graph content is not a governance model.
- The edge re-pointing can leave two edges with the same endpoints and
  relation key when the survivor already had one; the merge soft-deletes the
  duplicate in that case, but only for the edges it touches.
- The Relator can propose a merge in both directions when two nodes look like
  duplicates of each other. The second approval is refused (see §4), so the
  reviewer has to pick one; the other proposal simply fails to apply.

## Links

- [ADR-0023 Relator edge and merge semantics](ADR-0023-relator-edge-and-merge-semantics.md) —
  the decision this one completes.
- [ADR-0008 cross-workspace 404](ADR-0008-cross-workspace-404.md) — why a
  missing survivor is a 404.
- [ADR-0011 timestamp ownership](ADR-0011-timestamp-ownership.md) — the
  domain owns `updated_at`; the adapter owns `deleted_at`.
- [Relator spec](../components/relator.md) — the flow this decision serves.
- [FR-19](../requirements.md) — the requirement being closed.
