# TASK-27 — Vote Semantics: one `VoteValue` value object + decision record

> **Batch:** Phase 1S.3 (Policy) · **Depends on:** TASK-20 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TASK-16 correctly removed `value` from the **request** body (`CastVoteSchema`): a
client-supplied score is a trust hole, so the delta is derived server-side from
`interactionType`. But two inconsistencies remain:

1. `docs/modules/modules_02 §1` still names `domain/value_objects/VoteValue.ts`, which does not
   exist; and the `interactionType → value` mapping is an inline ternary in `CastVoteUseCase`
   (`DOWNVOTE ? -1 : 1`). `SUPPORT` and `VALIDATE` are silently scored like `UPVOTE`.
2. **Docs contradict each other on scoring:** `modules_01 §5` describes Redis-buffered CQRS
   (`HINCRBY vozlab:scores:{id}`, flushed every 60 s); `FR-15` / `US-04 AC#2` require the
   counters to be updated **atomically in the DB**. The code implements the synchronous DB
   update. This needs a recorded decision.

Also: `CastVoteUseCase` never verifies the vote target exists / belongs to the workspace, so
`applyScoreDelta` can update **0 rows** silently after the interaction row was inserted.

## 2. Objective
Introduce a single `VoteValue` value object as the one and only mapping from
`interactionType` to a numeric delta, keep the derived-value rule, verify the target before
writing, and record the CQRS-vs-synchronous decision in the docs.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` has no external deps; the value object is pure.
- The numeric `value` stays **server-derived and persisted**; never accept it from the client.
- Foreign-workspace target → 404, never 403 (TASK-22 rule).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/src/domain/value_objects/VoteValue.ts` |
| Edit | `apps/api/src/application/use_cases/CastVoteUseCase.ts` |
| Edit | `apps/api/src/domain/ports/IInteractionRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleInteractionRepository.ts` |
| Edit | `packages/shared-types/src/schemas/interaction.schema.ts` (comment only, if needed) |
| Edit | `docs/modules/modules_01_*.md` (§5) |
| Edit | `docs/modules/modules_02_*.md` (§1) |

## 5. Step-by-step instructions
1. Create `domain/value_objects/VoteValue.ts`:
   ```ts
   import { InteractionType } from '@vozlab/shared-types';

   /** The single mapping interactionType -> numeric score delta (RF-14). */
   export class VoteValue {
     private constructor(public readonly value: number) {}

     static fromInteractionType(type: InteractionType): VoteValue {
       if (type === 'DOWNVOTE') return new VoteValue(-1);
       // UPVOTE | SUPPORT | VALIDATE are all positive endorsements.
       return new VoteValue(1);
     }

     static fromNumber(value: number): VoteValue {
       return new VoteValue(value);
     }

     isPositive(): boolean { return this.value > 0; }
     toString(): string { return String(this.value); }
   }
   ```
   Export it from the domain (import path used by the use case). Do **not** place it in
   `shared-types` — it is a domain concept, not a transport DTO.
2. `CastVoteUseCase`: replace the ternary with
   `const value = VoteValue.fromInteractionType(input.interactionType).value;` and pass
   `value.value` to `interactionRepo.save`/`applyScoreDelta`. Keep the `Interaction` entity
   unchanged (it still stores a number).
3. **Verify the target.** Add to `IInteractionRepository`:
   `existsInWorkspace(targetId: string, targetType: InteractionTargetType, workspaceId: string, tid: string): Promise<boolean>`
   Implement in `DrizzleInteractionRepository` as a `switch` over `NODE` / `EDGE` / `PROPOSAL`
   / `POST`, each a `select({ id }).limit(1)` filtered by `id`, `workspaceId` and
   `isNull(deletedAt)` where the column exists (`nodes`, `edges`, `discussionPosts`; proposals
   have no `deletedAt`). Return `true` only if a row matched.
   In `CastVoteUseCase`, call it **before** creating the interaction; on `false` throw the
   type-appropriate 404 (`ERR_NODE_NOT_FOUND` / `ERR_EDGE_NOT_FOUND` / `ERR_PROPOSAL_NOT_FOUND`
   / `ERR_POST_NOT_FOUND`). Keep the existing idempotency branch first.
4. **Docs.**
   - `modules_01 §5`: replace the Redis-CQRS paragraph with the decision: **synchronous atomic
     DB increment is the implemented behaviour** (`FR-15`); the Redis-buffered flush is
     *deferred* (tracked in `EXECUTION_PLAN.md`) and is not to be implemented piecewise.
   - `modules_02 §1`: point at the real `domain/value_objects/VoteValue.ts` and state the
     mapping (`DOWNVOTE → -1`, `UPVOTE|SUPPORT|VALIDATE → +1`), noting the value is
     server-derived and never accepted from the client.

## 6. Constraints & gotchas
- Do not change `interactions_log.value` semantics or the unique constraint
  `unique_user_target_vote` (it stays `(userHash, targetId, targetType)`).
- Do not introduce Redis scoring — that is the deferred CQRS milestone.
- `existsInWorkspace` must not throw on a missing row; it returns `false`.
- Keep the response/event payload shapes identical.

## 7. Acceptance criteria
- [ ] `VoteValue.fromInteractionType` is the only place mapping interaction type → delta.
- [ ] `DOWNVOTE` increments negatively; `UPVOTE`/`SUPPORT`/`VALIDATE` increment positively.
- [ ] Voting on a non-existent or foreign-workspace target → 404, and **no** interaction row is inserted.
- [ ] `modules_01 §5` and `modules_02 §1` reflect the implemented behaviour.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "VoteValue" apps/api/src
grep -rn "DOWNVOTE ? -1 : 1" apps/api/src || echo "mapping centralized"
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-27` `[x]` in `TODO.md` with a one-line result note
  (include the CQRS decision).

## 10. Out of scope
- The Redis-buffered CQRS scoring milestone.
- Vote retraction/change (still rejected by `ERR_DUPLICATE_INTERACTION`).
- Reputation/weighted votes.
