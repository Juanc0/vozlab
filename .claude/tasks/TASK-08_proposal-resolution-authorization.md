# TASK-08 — Proposal Resolution Authorization (Maintainer / Moderator)

> **Batch:** Phase 1R.2 (governance) · **Depends on:** TASK-05, TASK-06 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-12 and US-06 give the **exclusive** power to approve (`APPROVED_BY_AUTHOR`) or reject
(`REJECTED_BY_AUTHOR`) an edit proposal to the **maintainer** (the original author of the
target object). FR-13 allows a **moderator** to apply a proposal (`AUTO_APPLIED`) only when
`community_score >= 10` **and** the maintainer has been inactive for more than 14 days.

Currently `ApproveProposalUseCase` and `RejectProposalUseCase` accept any authenticated user as
`resolverHash` and never check who they are. Any user can merge/reject any proposal.

Facts you need:
- Every object stores its creator hash: `nodes.authorHash`, `edges.authorHash`,
  `edit_proposals.proposerHash`; ontology classes/properties store `proposedBy`.
- `req.user.authorHash` (set by AuthGuard) is the caller's pseudonymous identity.
- Membership roles live in `auth.workspace_memberships.role`
  (`'ADMIN'|'MODERATOR'|'MEMBER'`); TASK-05 added `IMembershipRepository.getRole(userId, workspaceId, tid)`.
- The domain state machine lives in `EditProposal` (`approve`, `reject`, `autoApply`).
  `autoApply` already enforces the 14-day / score-10 rule and throws
  `ERR_UNMET_AUTO_APPLY_CRITERIA` (mapped to 422 after TASK-06).

## 2. Objective
Ensure only the target's maintainer (or a moderator, only for the auto-apply path) can resolve
a proposal, returning `403 ERR_AUTHORIZATION_FAILED` otherwise. Add the moderator auto-apply
endpoint (FR-13).

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` stays pure. Authorization data comes through ports; the **decision** may live in a
  small application-level helper.
- Physical multi-tenant isolation: all repository/port calls take `tid`.
- Errors: `DomainError` + `ERROR_CODES` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | use case | `apps/api/src/application/use_cases/AutoApplyProposalUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/ApproveProposalUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/RejectProposalUseCase.ts` |
| Edit | port | `apps/api/src/domain/ports/IOntologyRepository.ts` (add `findClassById`) |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleOntologyRepository.ts` |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/ProposalController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Extend the resolution input (`ResolveProposalInput`) to carry the caller identity used for
   authorization, e.g. `resolverUserId: string` in addition to `resolverHash`.
2. Resolve the **target author hash** for the proposal's `targetType`:
   - `NODE` → `nodeRepo.findById(targetId, tid)?.authorHash`
   - `EDGE` → `edgeRepo.findById(targetId, tid)?.authorHash`
   - `ONTOLOGY` → `ontologyRepo.findClassById(targetId, tid)?.proposedBy`
   Add `findClassById(id, tid)` to `IOntologyRepository` + its Drizzle adapter (mirror
   `findClassByKey` but by `id`, returning `null` when absent).
   If the target is missing, throw `DomainError('ERR_NODE_NOT_FOUND'|'ERR_EDGE_NOT_FOUND'|'ERR_VALIDATION_FAILED')`
   as appropriate.
3. In `ApproveProposalUseCase.execute` and `RejectProposalUseCase.execute`:
   - fetch the target author as above;
   - if `resolverHash !== targetAuthorHash` → `throw new DomainError('ERR_AUTHORIZATION_FAILED')`;
   - then proceed with the existing state machine + UnitOfWork + event logic.
4. Create `AutoApplyProposalUseCase` (FR-13):
   - loads the proposal;
   - authorization: the caller's **role** via `membershipRepo.getRole(resolverUserId, workspaceId, tid)`
     must be `'MODERATOR'` or `'ADMIN'`, else `DomainError('ERR_AUTHORIZATION_FAILED')`;
   - calls `proposal.autoApply(resolverHash)` (the domain enforces the 14-day/score-10 rule);
   - applies the delta (see TASK-09 for the polymorphic application) inside a UnitOfWork,
     updates the status, and publishes `PROPOSAL_AUTO_APPLIED`.
5. Add endpoint `PUT /api/v1/proposals/:id/auto-apply` in `routes.ts` (same guard chain:
   `authGuard -> tenantWorkspaceGuard -> rateLimit`) and a handler in `ProposalController`.
6. Wire `AutoApplyProposalUseCase` in `server.ts` and `RouteDependencies`.

## 6. Constraints & gotchas
- Approval/rejection is **maintainer-only**; do NOT let moderators use the plain approve path.
  Moderators use only `auto-apply`.
- `resolverHash` is compared by string equality with the stored author hash.
- Keep the post-commit event publication outside the transaction, best-effort.
- Do not silently succeed when the target object does not exist.

## 7. Acceptance criteria
- [ ] Non-author approve/reject → `403 ERR_AUTHORIZATION_FAILED`.
- [ ] Author approve/reject → succeeds (200) and transitions the proposal.
- [ ] `auto-apply` requires `MODERATOR`/`ADMIN`; a member gets 403.
- [ ] `auto-apply` before 14 days / below score 10 → `422 ERR_UNMET_AUTO_APPLY_CRITERIA`.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -n "auto-apply" apps/api/src/infrastructure/http/routes.ts
```

## 9. Definition of done / handoff
- Build passes and the four authorization outcomes hold.
- Mark `TASK-08` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Notifications to the maintainer (a real feature but not in this batch) and the
  semi-supervised threshold tuning referenced in `docs/00` §6.
