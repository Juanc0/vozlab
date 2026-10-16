# TASK-09 — Polymorphic Proposal Application (EDGE + ONTOLOGY deltas)

> **Batch:** Phase 1R.2 (governance) · **Depends on:** TASK-08 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-10 allows edit proposals against `NODE`, `EDGE` **and** `ONTOLOGY` targets, and FR-12 says
approval applies the change atomically. Today `ApproveProposalUseCase` only applies a delta when
`proposal.targetType === 'NODE'` (via `nodeRepo.applyDelta`). For `'EDGE'` and `'ONTOLOGY'` it
merely flips the proposal status — the change is silently lost.

Entities you will touch already exist:
- `Edge` (`domain/entities/Edge.ts`): fields `relationKey`, `attributes`, `status`; methods
  `changeStatus`, `updateAttributes`, `softDelete`.
- `OntologyClass` (`domain/entities/OntologyClass.ts`): fields `displayNames`, `descriptions`,
  `parentClassKey`, `status`; methods `activate()`, `reject()`.
- `IEdgeRepository`: `findById`, `findByWorkspace`, `save`, `softDelete`.
- `IOntologyRepository`: `findClassByKey`, `findActiveClasses`, `findDatatypeProperties`,
  `findObjectProperty`, `findActiveObjectProperties`, `saveClass`, `saveDatatypeProperty`,
  `saveObjectProperty`. (TASK-08 added `findClassById`.)

## 2. Objective
Make approval (and auto-apply) apply the `proposed_changes` delta to the correct target type,
inside the same `UnitOfWork` transaction as the proposal status change.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` stays pure; repositories take `tid` and reuse the `tx` handle.
- Multi-table writes go through `IUnitOfWork.runInTransaction(tid, cb)`.
- Errors via `DomainError`/`ERROR_CODES` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Edit | port | `apps/api/src/domain/ports/IEdgeRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleEdgeRepository.ts` |
| Edit | port | `apps/api/src/domain/ports/IOntologyRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleOntologyRepository.ts` |
| Edit | use case | `apps/api/src/application/use_cases/ApproveProposalUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/AutoApplyProposalUseCase.ts` (from TASK-08) |

## 5. Step-by-step instructions
1. Add to `IEdgeRepository`:
   ```ts
   applyDelta(targetId: string, proposedChanges: Record<string, unknown>, workspaceId: string, tid: string, tx?: any): Promise<void>;
   ```
   Implement in `DrizzleEdgeRepository` with a fetch-then-update inside the given `tx`:
   - load the edge by `id` + `workspaceId` (not deleted); throw `DomainError('ERR_EDGE_NOT_FOUND')` if absent;
   - merge `proposedChanges.attributes ?? {}` into existing `attributes`;
   - update `relationKey` if provided, and `attributes` always;
   - keep it scoped by `workspaceId`.
2. Add to `IOntologyRepository`:
   ```ts
   applyClassDelta(targetId: string, proposedChanges: Record<string, unknown>, tid: string, tx?: any): Promise<void>;
   activateClass(targetId: string, tid: string, tx?: any): Promise<void>;
   ```
   Implement both in the Drizzle adapter against `ontologyClasses`:
   - `applyClassDelta`: update `displayNames` / `descriptions` / `parentClassKey` from the delta;
   - `activateClass`: set `status = 'ACTIVE'` by `id`.
   Use the `DomainError('ERR_VALIDATION_FAILED')` if the class does not exist.
3. Refactor the delta application into one private helper used by **both**
   `ApproveProposalUseCase` and `AutoApplyProposalUseCase`, e.g. `applyProposalDelta(proposal, tx, tid, workspaceId)`:
   - `NODE` → `nodeRepo.applyDelta(...)`
   - `EDGE` → `edgeRepo.applyDelta(...)`
   - `ONTOLOGY` → `ontologyRepo.applyClassDelta(...)` **and** `ontologyRepo.activateClass(...)`
   All calls use the same `tx` so they commit atomically with `proposalRepo.updateStatus(...)`.
4. Keep the existing post-commit event publication.

## 6. Constraints & gotchas
- `proposed_changes` is `jsonb` (`Record<string, unknown>`). Validate/which keys you accept;
  do not blindly spread unknown keys into the DB update.
- For `ONTOLOGY`, an approved proposal must end with the class `ACTIVE`
  (FR-09/`OntologyClass.activate`). Respect the domain state machine — if the class is not
  `PROPOSED`, `activate()` throws; surface it as a domain error.
- Do not create a second transaction; everything shares the caller's `tx`.
- Keep `applyDelta` for nodes unchanged in behaviour.

## 7. Acceptance criteria
- [ ] Approving an `EDGE` proposal mutates the edge (`relationKey`/`attributes`).
- [ ] Approving an `ONTOLOGY` proposal applies display/description changes and sets `ACTIVE`.
- [ ] Approving a `NODE` proposal still works as before.
- [ ] All mutations and the status change happen in one transaction.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -n "applyDelta\|activateClass" apps/api/src/application/use_cases/ApproveProposalUseCase.ts
```

## 9. Definition of done / handoff
- Build passes and the three target types merge correctly.
- Mark `TASK-09` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Proposal diff visualisation, notifications, and the AGE graph mirroring of applied changes.
