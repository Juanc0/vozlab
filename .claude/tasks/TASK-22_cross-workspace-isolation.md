# TASK-22 — Cross-Workspace Isolation (physical tenant = not enough)

> **Batch:** Phase 1S.1 (Correctness) · **Depends on:** none · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
The architecture promises **workspace** isolation on top of the **tenant** isolation
(`X-Workspace-ID` on every protected request, FR-05). The tenant boundary is physical
(one DB per institution via `tid`), but inside one tenant **nothing checks that the
objects addressed by id belong to the request's workspace**. Confirmed holes:

| Use case | Gap |
| --- | --- |
| `CreateEdgeUseCase` | loads source/target nodes by id + `tid` only → an edge can connect nodes of two different workspaces |
| `ApproveProposalUseCase` / `RejectProposalUseCase` / `AutoApplyProposalUseCase` | `proposal.workspaceId` is never compared to `input.workspaceId` |
| `CloseThreadUseCase` | no `workspaceId` in its input; `findThreadById` is id-only |
| `AddPostUseCase` / `ListPostsUseCase` | verify only that the thread exists, not that it is in this workspace |
| `ActivateOntologyClassUseCase` + `applyClassDelta` / `activateClass` / `findClassById` | class lookups and updates are id-only, unscoped by workspace |

`docs/modules/modules_01` requires workspace separation; this is a correctness bug, not a
nice-to-have.

## 2. Objective
Make every read and mutation that addresses an existing object also verify **and enforce**
the object's `workspaceId` matches the request workspace, so a caller in workspace A can
never read, mutate, or bridge to workspace B inside the same tenant.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Prefer **not-found** over **forbidden** when the object is in another workspace — do not
  leak the existence of objects outside the caller's workspace.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/application/use_cases/CreateEdgeUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/ApproveProposalUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/RejectProposalUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/AutoApplyProposalUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/CloseThreadUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/AddPostUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/ListPostsUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/proposalAuthorization.ts` |
| Edit | `apps/api/src/application/use_cases/ActivateOntologyClassUseCase.ts` |
| Edit | `apps/api/src/domain/ports/IOntologyRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleOntologyRepository.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/DiscussionController.ts` |

## 5. Step-by-step instructions
1. **Edges.** In `CreateEdgeUseCase.execute`, after loading `source`/`target`, require
   `source.workspaceId === input.workspaceId && target.workspaceId === input.workspaceId`;
   otherwise `throw new DomainError('ERR_NODE_NOT_FOUND')`. (Do not leak which endpoint was
   foreign.) The ontology `findObjectProperty` call is already workspace-scoped — keep it.
2. **Proposals.** In `ApproveProposalUseCase`, `RejectProposalUseCase` and
   `AutoApplyProposalUseCase`, right after loading the proposal, add
   `if (proposal.workspaceId !== input.workspaceId) throw new DomainError('ERR_PROPOSAL_NOT_FOUND')`
   (and, where the resolved proposal is re-read, at the same point). Do this **before** any
   maintainer/role check.
3. **Ontology port.** Change the port and adapter to scope by workspace:
   - `findClassById(id: string, workspaceId: string, tid: string)`
   - `applyClassDelta(targetId, proposedChanges, workspaceId, tid, tx?)`
   - `activateClass(targetId, workspaceId, tid, tx?)`
   Add `eq(ontologyClasses.workspaceId, workspaceId)` to each `where`, and keep the
   `throw new DomainError('ERR_VALIDATION_FAILED', 'ontology class … not found')` when no row
   matches. Update all callers (`ActivateOntologyClassUseCase`, `proposalAuthorization.ts`
   `resolveTargetAuthorHash`, `ApproveProposalUseCase`'s `applyProposalDelta`).
4. **Discussions.** `findThreadById` stays id-only (single round-trip, adapter concern), but
   every consumer compares:
   - `CloseThreadUseCase`: add `workspaceId: string` to `CloseThreadInput`; if
     `thread.workspaceId !== input.workspaceId` → `ERR_THREAD_NOT_FOUND`.
   - `AddPostUseCase` and `ListPostsUseCase`: same check on the loaded thread (both already
     load it) → `ERR_THREAD_NOT_FOUND`.
   - `DiscussionController`: pass `ctx.workspaceId` into `closeThread.execute` (the other two
     already have it in the input type).
5. Add a short paragraph to `docs/modules/modules_02_backend_fastify_guide.md` stating the
   rule: **every id-addressed read/mutation must be scoped to the request workspace; a
   mismatch is reported as 404, never 403.**

## 6. Constraints & gotchas
- Return `ERR_*_NOT_FOUND` (404) for foreign-workspace objects — do not use
  `ERR_AUTHORIZATION_FAILED` (403), which would confirm the object exists.
- Keep the existing maintainer check (FR-12) intact; workspace scoping is **additional**.
- Do not add new repository methods unless the port is listed above; `findThreadById` stays
  id-only on purpose (the consumers already load the entity).
- `NodeController` / `EdgeController` already pass `ctx.workspaceId`; do not change their
  signatures.

## 7. Acceptance criteria
- [ ] Creating an edge whose source or target is in another workspace → 404 `ERR_NODE_NOT_FOUND`.
- [ ] Approving/rejecting/auto-applying a proposal from another workspace → 404 `ERR_PROPOSAL_NOT_FOUND`.
- [ ] Closing / posting to / listing posts of another workspace's thread → 404 `ERR_THREAD_NOT_FOUND`.
- [ ] `ActivateOntologyClassUseCase` / ontology deltas reject a class from another workspace → 404/422, never mutate.
- [ ] `grep -rn "findClassById\|activateClass\|applyClassDelta" apps/api/src` shows a `workspaceId` argument at every call site.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "findClassById\|activateClass\|applyClassDelta" apps/api/src
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-22` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Cross-**tenant** isolation (already physical via `tid`).
- The soft-delete read filtering (TASK-25) and the duplicated cursor helpers (TASK-24).
