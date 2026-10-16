# TASK-15 — Interactions/Votes Vertical: Wire Votes & Unify Score Updates

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-06, TASK-14 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-14/FR-15 require an immutable interaction log (`public.interactions_log`) with a single
active vote per user and target (`unique_user_target_vote`), and atomic `O(1)` updates of the
denormalized counters (`upvotes`, `downvotes`, `community_score`).

The code already has:
- Entity `Interaction` (immutable record) and `DiscussionPost.registerVote`.
- Port `IInteractionRepository` (`findByUserAndTarget`, `save`, `applyScoreDelta`) + adapter
  `DrizzleInteractionRepository` (`applyScoreDelta` switches on target type and updates
  `nodes`/`edges`/`editProposals`/`discussionPosts`).
- Use case `CastVoteUseCase` (idempotent for the same interaction type; throws
  `ERR_DUPLICATE_INTERACTION` for a different type; wraps insert + score delta in a UnitOfWork;
  publishes `INTERACTION_CAST`).
- Controller `InteractionController` (`vote`).

**Two issues:**
1. The vertical is **not wired** (`routes.ts` has no vote route, `server.ts` never instantiates
   the repo/use case). In addition, `DrizzleDiscussionRepository.applyPostVote(postId, value, ...)`
   exists but is **never called** — voting on a `POST` goes through `applyScoreDelta`, which only
   updates `community_score` and leaves `upvotes`/`downvotes` stale (inconsistent with
   `DiscussionPost` counters).
2. `CastVoteSchema` carries a `value` field that `CastVoteUseCase` ignores (the delta is derived
   from `interactionType`). This is confusing and must be resolved (see TASK-16).

## 2. Objective
Wire the interactions endpoint end-to-end and make score updates consistent for every target
type, including discussion posts.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; adapters take `tid`; the insert + counter update share one UnitOfWork `tx`.
- Errors via `DomainError` + `sendError`/`mapDomainError` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleInteractionRepository.ts` |
| Edit | port | `apps/api/src/domain/ports/IInteractionRepository.ts` |
| Edit | use case | `apps/api/src/application/use_cases/CastVoteUseCase.ts` |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/InteractionController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Make `applyScoreDelta(targetId, targetType, delta, tid, tx)` consistent:
   - `NODE` → `nodes.community_score += delta`
   - `EDGE` → `edges.community_score += delta`
   - `PROPOSAL` → `edit_proposals.community_score += delta`
   - `POST` → update **both** denormalized counters coherently, i.e. mirror
     `DrizzleDiscussionRepository.applyPostVote`: `upvotes += (delta > 0 ? 1 : 0)`,
     `downvotes += (delta < 0 ? 1 : 0)`,
     `community_score = upvotes - downvotes` (or `community_score += delta`).
   Keep the `default` case throwing `DomainError('ERR_VALIDATION_FAILED', 'unsupported target type')`.
2. Keep `DiscussionsPost` counters in sync: either delegate `POST` to the same SQL as
   `applyPostVote`, or delete `applyPostVote` and keep a single implementation — **do not leave
   two divergent code paths**. Document the choice in a comment.
3. `CastVoteUseCase`: replace `throw new Error('ERR_DUPLICATE_INTERACTION')` with
   `DomainError`. Keep the idempotency rule (same type → return existing) and the delta derived
   from `interactionType`.
4. `InteractionController`: keep the existing shape; ensure it uses `getRequestContext` +
   shared error helpers (it already does).
5. `routes.ts`: register `POST /api/v1/interactions` (guard chain). `server.ts`: instantiate
   `DrizzleInteractionRepository(poolManager)` + `CastVoteUseCase` and extend
   `RouteDependencies` with `IUnitOfWork` (already constructed there).

## 6. Constraints & gotchas
- The unique index is `(user_hash, target_id, target_type)`; the use case already checks
  existence first. Keep returning the existing interaction for a repeated identical vote
  (idempotent) rather than a 409.
- All counter updates must be `sql`-level `+=` (no read-modify-write) to stay `O(1)` and
  concurrency-safe.
- The interaction log row is immutable; never update it.

## 7. Acceptance criteria
- [ ] `routes.ts` registers `POST /api/v1/interactions` behind the guard chain and `server.ts` wires it.
- [ ] Voting on a `POST` updates `upvotes`/`downvotes`/`community_score` consistently.
- [ ] Voting twice with the same type is idempotent; a different type → `ERR_DUPLICATE_INTERACTION` (409).
- [ ] Only one `applyPostVote`/`applyScoreDelta(POST)` implementation remains.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -rn "applyPostVote" apps/api/src
grep -n "'/api/v1/interactions" apps/api/src/infrastructure/http/routes.ts
```

## 9. Definition of done / handoff
- Build passes; vote counters are consistent for all four target types.
- Mark `TASK-15` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- The Redis buffered-vote/CQRS design in `docs/modules/modules_01` §5 (a future optimisation),
  and vote-removal/undo.
