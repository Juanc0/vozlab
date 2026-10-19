# TASK-35 — Workspace-Scope Target-Author Resolution (NODE / EDGE)

> **Batch:** Phase 1T.1 (Correctness) · **Depends on:** TASK-33 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`proposalAuthorization.resolveTargetAuthorHash` resolves the maintainer of a proposal's target
(FR-12). It scopes the ONTOLOGY branch by workspace but resolves NODE/EDGE with the workspace-less
`findById(id, tid)`:

```ts
case 'NODE': { const node = await repos.nodeRepo.findById(proposal.targetId, tid); … }
case 'EDGE': { const edge = await repos.edgeRepo.findById(proposal.targetId, tid); … }
case 'ONTOLOGY': { const cls = await repos.ontologyRepo.findClassById(proposal.targetId, workspaceId, tid); … }
```

TASK-22 validated `proposal.workspaceId === input.workspaceId` **before** calling this, so the
practical exposure needs a proposal whose workspace matches the caller but whose `targetId` points
elsewhere. TASK-33 removes that at creation, but the resolver must not rely on it: the function's
contract should be "resolve the target **in this workspace**", symmetric across all three branches.

## 2. Objective
Make the NODE and EDGE branches workspace-scoped, so a mismatch is reported as not-found instead of
resolving a foreign object's author.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Foreign-workspace → 404 (`ERR_NODE_NOT_FOUND` / `ERR_EDGE_NOT_FOUND`), never 403.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/application/use_cases/proposalAuthorization.ts` |
| Edit | `apps/api/src/domain/ports/INodeRepository.ts` (only if you add a method) |
| Edit | `apps/api/src/domain/ports/IEdgeRepository.ts` (only if you add a method) |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleEdgeRepository.ts` |
| Edit | `apps/api/tests/application/proposalAuthorization.test.ts` (**create**) |

## 5. Step-by-step instructions
1. Choose **one** mechanism, matching the shape TASK-33 chose (read its result note first):
   - **(a) Reuse `IInteractionRepository.existsInWorkspace`** (already workspace-scoped for
     NODE/EDGE) to *assert* existence, then keep `findById` for the author. This is two queries and
     does not guarantee the same row — avoid unless it is already wired in.
   - **(b) Add `findByIdInWorkspace(id, workspaceId, tid)` to `INodeRepository` and
     `IEdgeRepository`** and implement it in the Drizzle adapters exactly like
     `DrizzleProposalRepository.findByIdInWorkspace` (`and(eq(id), eq(workspaceId))` — plus
     `isNull(deletedAt)` for nodes/edges so a soft-deleted target reads as not-found). Then use it in
     the NODE/EDGE branches. **Recommended**: one query, explicit contract, mirrors TASK-23.
2. Keep the thrown codes identical to today (`ERR_NODE_NOT_FOUND`, `ERR_EDGE_NOT_FOUND`,
   `ERR_VALIDATION_FAILED` for ONTOLOGY) so callers do not change.
3. Because the branch no longer uses `findById` for resolution, leave `findById` in place (other use
   cases use it).
4. Add `apps/api/tests/application/proposalAuthorization.test.ts` with plain fakes:
   - same-workspace NODE → returns `node.authorHash.toString()`;
   - foreign-workspace NODE → throws `ERR_NODE_NOT_FOUND`;
   - same for EDGE;
   - missing ONTOLOGY class → throws `ERR_VALIDATION_FAILED`.

## 6. Constraints & gotchas
- Do **not** change `assertIsMaintainer` or the 403 semantics.
- Do **not** add a workspace argument to `findById` (other callers rely on the id-only signature);
  add a new method instead.
- Keep `resolveTargetAuthorHash`'s `default:` branch throwing `ERR_VALIDATION_FAILED` for an unknown
  `targetType` (it crosses a DB boundary untyped).

## 7. Acceptance criteria
- [ ] `grep -rn "findById(proposal.targetId, tid)\|findById(targetId, tid)" apps/api/src/application` → no matches.
- [ ] A proposal whose target is in another workspace resolves as 404, never another author.
- [ ] `pnpm --filter @vozlab/api test` passes, including the new file.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "resolveTargetAuthorHash" apps/api/src
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-35` `[x]` in `TODO.md` with a one-line result note naming the port
  method added (if any), so TASK-39's naming pass can align it.

## 10. Out of scope
- Proposal *creation* validation (TASK-33).
- The `edit_proposals.target_id` FK (separate migration task).
