# ADR-0006: Per-entity soft-delete policy

- Status: Accepted
- Date: 2026-10-19

## Context

The old data-model document said that "all main tables" implement logical deletion, but the schema and endpoints were inconsistent: nodes and discussion posts had `deleted_at` without a delete endpoint, `listPosts` leaked soft-deleted rows, and `DeleteEdgeUseCase` stamped `deleted_at` twice (domain and adapter, with different timestamps). Proposals and ontology entries are governance records with a lifecycle, not deletable content, and votes are an immutable log.

## Decision

Deletion is entity-specific. Nothing is hard-deleted.

| Table / entity | Mechanism | Read filter | Delete path |
| --- | --- | --- | --- |
| `public.nodes` | `deleted_at` | yes | `DELETE /api/v1/nodes/:id`, author-only, 204 |
| `public.edges` | `deleted_at` | yes | `DELETE /api/v1/edges/:id`, author-only, 204 |
| `social.discussion_posts` | `deleted_at` | yes | `DELETE /api/v1/discussions/posts/:id`, author-only, 204 |
| `social.discussion_threads` | status (`OPEN`/`CLOSED`) | n/a | `PUT /api/v1/discussions/:threadId/close`, creator-only |
| `public.edit_proposals` | status (`PENDING`/`APPROVED_BY_AUTHOR`/`REJECTED_BY_AUTHOR`/`AUTO_APPLIED`) | n/a | none; governance transitions |
| `meta.ontology_*` | status (`PROPOSED`/`ACTIVE`/`REJECTED`) | n/a | none; governance transitions |
| `public.interactions_log` | immutable | n/a | none |

The **adapter is the single writer of `deleted_at`**. Use cases authorize and call `repo.softDelete`; domain entities do not write `deletedAt` and have no `softDelete()` method. A repeated delete of an already-deleted row, a missing row, or a row in another workspace is reported as 404, so the call is idempotent. Non-authors get 403 only after the object is known to exist in the request workspace. Deleting a node does not cascade to its edges at the domain level; both are soft-deleted independently.

## Consequences

### Positive

- History and governance trails survive; relationships and proposals are not broken by a physical delete.
- Every read path has an explicit filter rule instead of an implicit assumption.
- A single writer removes timestamp divergence and dead domain code.

### Negative / costs

- Every query on a soft-deletable table must remember `deleted_at IS NULL`; a missing filter is a data leak.
- Two deletion vocabularies (timestamp vs status) require readers to know the entity's lifecycle.
- No hard-delete or retention/erasure path exists; a future data-retention policy needs its own decision.

## Links

- `docs/archive/spec-v1/modules/modules_01_data_model_and_metamodel.md` §2
- `apps/api/src/application/use_cases/` (`DeleteNodeUseCase.ts`, `DeleteEdgeUseCase.ts`, `DeletePostUseCase.ts`)
- `apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts`
- `docs/archive/tasks/TASK-24_keyset-and-softdelete-deduplication.md`, `TASK-25_soft-delete-policy.md`
