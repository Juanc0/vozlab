# ADR-0005: Vote scoring is a synchronous atomic DB increment

- Status: Accepted
- Date: 2026-10-19

## Context

FR-15 requires the denormalized counters (`upvotes`, `downvotes`, `community_score`) to be updated atomically with O(1) latency. An earlier draft in `modules_01` §5 described a Redis-buffered CQRS scheme: `HINCRBY vozlab:scores:{id}` plus a periodic 60-second flush. The two designs contradict each other; the code used the synchronous increment, and TASK-27 made that behavior explicit.

The interaction log is append-only, with a `unique_user_target_vote` constraint, and the vote delta is derived server-side from `interactionType`.

## Decision

Vote scoring is a synchronous, atomic database increment inside the same `UnitOfWork` transaction as the interaction insert.

- `VoteValue` is the only mapping from `interactionType` to delta: `DOWNVOTE -> -1`; `UPVOTE`, `SUPPORT`, `VALIDATE -> +1`.
- `CastVoteUseCase` verifies that the target exists in the request workspace, inserts the interaction and calls `applyScoreDelta` in one transaction.
- `applyScoreDelta` performs a single `sql`-level `+=` update on `community_score` for `NODE`/`EDGE`/`PROPOSAL`, and on `upvotes`/`downvotes`/`community_score` for `POST`.
- The same vote type is idempotent; a different vote type on the same target is rejected. The client never supplies a score.
- The Redis-buffered CQRS variant is deferred. It is not to be implemented piecewise (for example, a Redis counter without the flush/reconciliation path).

## Consequences

### Positive

- The counters are strongly consistent with the interaction log after commit.
- A Redis outage cannot lose votes or leave counters behind; Redis is not on the write-critical path for scoring.
- The rule is testable with a transaction fake and a single SQL statement.
- There is one mapping for all interaction types.

### Negative / costs

- Hot targets serialize on the counter row; throughput is bounded by PostgreSQL row updates.
- Counter reads do not scale independently of the primary database.
- Moving to CQRS later requires a flush/reconciliation design and a migration of the counters, not just a cache addition.

## Links

- `apps/api/src/application/use_cases/CastVoteUseCase.ts`
- `apps/api/src/domain/value_objects/VoteValue.ts`
- `apps/api/src/infrastructure/persistence/repositories/DrizzleInteractionRepository.ts`
- `docs/archive/spec-v1/modules/modules_01_data_model_and_metamodel.md` §5
- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §1
- `docs/archive/tasks/TASK-27_vote-semantics-alignment.md`
