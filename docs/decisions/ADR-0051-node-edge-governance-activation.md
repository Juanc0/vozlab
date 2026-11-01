# ADR-0051 — Node and edge governance activation (settling D-03)

- Status: Accepted
- Date: 2026-11-01
- Amends: [ADR-0026](ADR-0026-merge-contract.md) (merge proposals remain one
  governance path; node/edge lifecycle becomes the other) and the status
  unions in `docs/domain-model.md` §5 (activation/rejection routes now exist).
- Related: [ADR-0008](ADR-0008-cross-workspace-404.md) (foreign-workspace
  resources answer 404), [ADR-0013](ADR-0013-random-opaque-pseudonym.md)
  (opaque `author_hash`), [ADR-0023](ADR-0023-relator-edge-and-merge-semantics.md)
  (Relator creates `PENDING` edges), [ADR-0026](ADR-0026-merge-contract.md)
  (proposal kinds), FR-07, FR-10, FR-12, FR-13 in
  [requirements.md](../requirements.md), `docs/plans/node-governance/v1.md`,
  `docs/knowledge/graph-and-ontology-strategy.md` §4 (F-01, D-03).

## Context

Nodes and edges are created `PENDING` by construction (the API always stores
new graph objects as `PENDING`; the domain default is `PENDING`). Until this
decision, **no HTTP route advanced that status**: `Node.changeStatus` and
`Edge.changeStatus` existed but were unreachable, so content created through
the API — including drafts created by the Extractor and `PENDING` edges created
by the Relator — stayed `PENDING` forever unless a merge proposal touched it
(F-01, "Critical" in the knowledge-transfer register). The graph already
returned `PENDING` rows in its subgraph query, but nothing marked them as
unreviewed and nothing could promote or reject them.

The open question was D-03: what does `PENDING` mean to a reader, and who may
move it? The forces:

- **Visibility vs. noise.** Hiding `PENDING` content would make ingestion and
  Relator edges invisible until someone acts, defeating the "visible on
  creation" intent of the collaborative graph and starving new content of the
  votes and discussion that drive governance. But treating `PENDING` as fully
  equal to `ACTIVE` would erase the distinction between reviewed and unreviewed
  content and let unvetted machine output look authoritative.
- **Author ownership.** `author_hash` is stamped on every node and edge at
  creation and grants non-waivable maintainer rights (FR-07). The creator is
  the natural first reviewer of their own content, including content they
  authored directly and content attributed to them by an agent acting under
  their identity.
- **Moderator override.** A moderator or administrator of the workspace must be
  able to unblock content the author will never touch, otherwise `PENDING`
  becomes a graveyard. The existing FR-13 machinery (`community_score >= 10`
  plus author inactivity `>= 14 days`) already defines the "community has
  spoken and the author is gone" condition for proposals; reusing it keeps one
  threshold model instead of two.
- **Terminality.** `MERGED`, `DEPRECATED` and `REJECTED` are terminal today.
  Whatever activation adds must not reopen those states or weaken the
  merge-proposal flow (ADR-0026).
- **Cross-workspace safety.** A foreign-workspace object must read as missing
  (ADR-0008). Activation and rejection are workspace-scoped mutations and
  inherit that rule.
- **Quorum is out of scope.** Distinct-supporter quorum (G3) belongs to Area C
  and is deliberately not introduced here; v1 keeps the binary
  author-or-moderator decision.

The alternatives considered were:

1. **Hide `PENDING` content until activation.** Rejected: it starves new
   content of visibility and votes, hides Extractor/Relator output from the
   community that is supposed to govern it, and turns the graph into a
   moderator queue. It also conflicts with the subgraph query, which already
   includes `PENDING` rows.
2. **Auto-activate on creation (no `PENDING` gate).** Rejected: it removes the
   unreviewed marker entirely, lets unvetted machine output look authoritative,
   and breaks the governance loop the whole plan exists to close. It is the
   current de-facto state for nothing, and making it explicit would be a
   regression.
3. **Quorum-based activation in v1.** Rejected: distinct-supporter quorum
   (G3) is Area C work and would couple this plan to unbuilt voting
   aggregation; v1 keeps the decision binary and defers quorum.
4. **Visible on creation, marked unreviewed, activated by author or
   moderator.** Chosen. `PENDING` content is shown with a dashed border and an
   "unreviewed" badge; `REJECTED` content is excluded from the graph and from
   the Relator's neighbour list; `PENDING → ACTIVE` and `PENDING → REJECTED`
   are performed by the author (`author_hash` match) or any
   `MODERATOR`/`ADMIN` of the workspace, with a moderator/admin force-activate
   override reusing the FR-13 criteria.

## Decision

### 1. Visibility of `PENDING` and `REJECTED` content

- `PENDING` nodes and edges are **visible** in the graph. The subgraph read
  path already returns them; the web client renders them with a dashed border
  and an "unreviewed" status badge (T7 of the plan). The status is announced
  via `aria-label` on the card.
- `REJECTED` nodes and edges are **excluded** from the graph window and from
  the Relator's neighbour list (`GET /api/v1/nodes/:id/neighbors`). They are
  not deleted; they remain readable by id for audit and discussion.
- `ACTIVE` content is unchanged.

### 2. Activation and rejection rights

- `PENDING → ACTIVE` ("approve") and `PENDING → REJECTED` ("reject") are
  performed by:
  - (a) the object's author — a maintainer whose `author_hash` equals the
    row's `author_hash`; or
  - (b) any `MODERATOR` or `ADMIN` of the workspace (workspace role, resolved
    through `IMembershipRepository.getRoles` + `isModeratorOrAdmin`).
- The same actors may reject. Rejection is a terminal state and leaves the
  object's other fields untouched.
- A non-author, non-moderator receives `ERR_AUTHORIZATION_FAILED` (403 is
  appropriate here because the object is in the caller's workspace and exists;
  the rule of ADR-0008 governs *foreign-workspace* resources, which answer
  404).
- A missing or foreign-workspace object answers `ERR_NODE_NOT_FOUND` /
  `ERR_EDGE_NOT_FOUND` (404), never 403.
- An already-active or otherwise non-`PENDING` object yields
  `ERR_INVALID_STATE_TRANSITION` (409) — the transition table is unchanged:
  `PENDING → ACTIVE | REJECTED` only.

### 3. Auto-apply (moderator force-activate)

- A `MODERATOR` or `ADMIN` may force-activate a `PENDING` node or edge
  (`PUT /api/v1/nodes/:id/auto-activate`, `PUT /api/v1/edges/:id/auto-activate`)
  when **both** hold:
  - `community_score >= 10`; and
  - the author's last activity is at least 14 days ago.
- The criteria reuse `EditProposal.autoApply` (FR-13) exactly; there is one
  threshold model. A dedicated use case (`AutoActivateNodeUseCase`,
  `AutoActivateEdgeUseCase`) enforces the criteria and throws
  `ERR_UNMET_AUTO_APPLY_CRITERIA` when they are not met.
- Auto-activation publishes `NODE_AUTO_ACTIVATED` / `EDGE_AUTO_ACTIVATED`.

### 4. HTTP surface

- `PUT /api/v1/nodes/:id/activate`, `PUT /api/v1/nodes/:id/reject`,
  `PUT /api/v1/edges/:id/activate`, `PUT /api/v1/edges/:id/reject`,
  plus the two `auto-activate` routes above.
- Guarded by `authGuard → tenantWorkspaceGuard → rateLimit` (write bucket,
  `scoped('node-governance')` / `scoped('edge-governance')`).
- Controllers delegate to a single use case and return the updated entity with
  200; 404/403/409 as above. No controller queries the database.
- All mutations persist inside `UnitOfWork.runInTransaction`; events are
  published after commit, best-effort (`NODE_ACTIVATED`, `NODE_REJECTED`,
  `EDGE_ACTIVATED`, `EDGE_REJECTED`).

### 5. Terminal states

Unchanged: `MERGED`, `DEPRECATED` and `REJECTED` remain terminal.
`ACTIVE → MERGED | DEPRECATED` is unchanged and is driven by merge proposals
(ADR-0026). Activation never moves an object out of a terminal state and
never reopens `REJECTED`.

### 6. No quorum in v1

Distinct-supporter quorum (G3) is deferred to Area C. v1 keeps the decision
binary: author or moderator. A future quorum ADR may add a community-activated
path without changing this ADR's visibility or terminality rules.

## Consequences

### Positive

- The governance loop closes: every state in the `Node`/`Edge` transition
  table that this plan covers becomes reachable through the API and exercised
  by a test, instead of being dead domain code.
- `PENDING` content is discoverable and votable on creation, so the community
  can govern it; `REJECTED` content is hidden from the graph and from the
  Relator without being destroyed.
- One threshold model: auto-activation reuses the FR-13 criteria, so there is
  a single definition of "community has spoken and the author is gone".
- Author ownership is preserved: the creator remains the first and cheapest
  reviewer of their own content, and moderator power is an override, not a
  replacement.
- Terminality and the merge-proposal flow (ADR-0026) are untouched; no
  existing transition or event contract breaks.

### Negative / costs

- `PENDING` content is now visible in the graph, so the PWA must render an
  unreviewed marker and filter `REJECTED` rows; the graph painter and the
  inspector gain a status dimension (T6, T7 of the plan).
- A moderator or administrator can now move any `PENDING` object in their
  workspace to `ACTIVE` or `REJECTED`; this is gated by the workspace role and
  rate-limited per action, but there is no finer-grained "can approve but not
  reject" permission.
- `PENDING` rows remain in the subgraph read path, so the Relator's neighbour
  list must filter `REJECTED` explicitly; forgetting that filter would let
  rejected content influence new edges.
- Auto-activation depends on `community_score` and author-activity data that
  must be populated; if either is stale, the override silently refuses, which
  is the safe default but may surprise moderators.
- Quorum is still absent: a single moderator can activate content without
  community support beyond the auto-apply threshold, which is a deliberate
  v1 limitation deferred to Area C.

## Links

- `docs/plans/node-governance/v1.md` — T1 (this ADR) through T9.
- `docs/domain-model.md` §5 — status unions and state machines (annotated by
  this ADR).
- `docs/requirements.md` — FR-07, FR-10, FR-12, FR-13.
- `apps/api/src/domain/entities/Node.ts`, `Edge.ts` — `changeStatus` and the
  transition tables.
- `apps/api/src/application/use_cases/AutoApplyProposalUseCase.ts` — the
  FR-13 criteria reused by auto-activation.
- `apps/api/src/infrastructure/persistence/drizzle/DrizzleNodeRepository.ts`,
  `DrizzleEdgeRepository.ts` — persistence adapters (T2–T4).