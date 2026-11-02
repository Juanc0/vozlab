# ADR-0011: Timestamp ownership

- Status: Accepted
- Date: 2026-10-19

## Context

`Node.createdAt` and `Node.updatedAt` were domain fields, but `DrizzleNodeRepository.update` and `applyDelta` wrote `updatedAt: new Date()` in the adapter, ignoring the entity's value. The domain field was effectively dead, and the adapter's clock could disagree with the entity that enforced the state transition. Soft-delete had the mirror problem: `Edge.softDelete()` stamped `deletedAt` before the adapter wrote it, and `DiscussionPost` accepted `deletedAt` as a constructor argument; the adapters also stamp the column.

## Decision

Two writers must never stamp the same column. The rule is:

> **The domain owns the business timestamps (`created_at`, `updated_at`); the adapter owns `deleted_at`.**

| Concern | Single writer | Detail |
| --- | --- | --- |
| Create | Domain entity | The use case builds the entity; its constructor sets `createdAt`/`updatedAt`; the adapter persists those values. |
| Update / approved delta | Domain method | `Node.changeStatus` / `Node.updateAttributes` bump `updatedAt`; the adapter persists `entity.updatedAt` verbatim and never calls `new Date()` in an `UPDATE`. |
| Soft-delete | Adapter | `softDelete` stamps `deleted_at`; use cases never touch it. Entities that map the column (`DiscussionPost`, `Edge`) project `deletedAt`; `Node` does not expose it. |
| Reads | Adapter | Adapters filter `deleted_at IS NULL`; use cases enforce workspace and authorization on the entity. |

`applyDelta` receives only the proposed changes, so the adapter loads the row, rebuilds the entity with `toDomain`, routes the delta through the entity's methods and persists the resulting `updatedAt` in the same `UPDATE`. There is no adapter-side `new Date()` exception.

## Consequences

### Positive

- The entity and the row cannot disagree about `updatedAt`.
- Time-dependent behavior is unit-testable without freezing the adapter clock.
- The single-writer rule is greppable (`updatedAt: new Date()` in adapters is a bug).

### Negative / costs

- `applyDelta` performs a read before the update and must keep the entity's mapping in sync with the table.
- Every new adapter must load the aggregate for updates instead of issuing a blind field update.
- `deletedAt` remains on the entities that project it (`DiscussionPost`, `Edge`), and `Edge` holds it in a public mutable field; a future caller could mutate it.

## Links

- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §6.7
- `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts`
- `apps/api/src/domain/entities/Node.ts`
- `apps/api/tests/infrastructure/timestampOwnership.test.ts`
- `.claude/tasks/TASK-38_timestamp-ownership.md`
- `.claude/reviews/REVIEW-2026-10-17_phase-1s.md` M-12, concern C4
