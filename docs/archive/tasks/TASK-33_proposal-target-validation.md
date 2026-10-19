# TASK-33 — Validate the Proposal Target on Creation (workspace + existence)

> **Batch:** Phase 1T.1 (Correctness) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`CreateProposalUseCase.execute` builds an `EditProposal` and calls `proposalRepo.save` **without ever
checking that `targetId` exists or belongs to the request workspace**:

```ts
async execute(input: CreateProposalInput): Promise<EditProposal> {
  const proposal = new EditProposal(randomUUID(), input.workspaceId, input.targetId, …);
  await this.proposalRepo.save(proposal, input.tid);
  …
}
```

`edit_proposals.target_id` also has **no foreign key** (`M-12`). Consequences: a proposal can point
at a nonexistent object (resolution fails much later with a confusing error) or at an object of
**another workspace** (then `proposalAuthorization.resolveTargetAuthorHash` resolves *that*
object's author for NODE/EDGE — see TASK-35). TASK-22 closed the *resolution* side; creation is
still open.

## 2. Objective
Reject a proposal whose target does not exist in the request workspace, at creation time, with the
type-appropriate 404 — the same rule TASK-27 applied to votes.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Foreign-workspace target → **404** (`ERR_*_NOT_FOUND`), never 403.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/application/use_cases/CreateProposalUseCase.ts` |
| Edit | `apps/api/src/infrastructure/http/server.ts` (wire the new dependencies) |
| Edit | `apps/api/src/domain/ports/IProposalRepository.ts` (only if you add a port method) |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleProposalRepository.ts` (only if you add a port method) |
| Edit | `apps/api/tests/application/CreateProposalUseCase.test.ts` (**create**) |

## 5. Step-by-step instructions
1. Reuse the existing workspace-scoped existence check rather than writing a new query. Two
   acceptable shapes — pick **one** and keep it small:
   - **(a) Prefer reusing `IInteractionRepository.existsInWorkspace`.** It already switches over
     `NODE`/`EDGE`/`PROPOSAL`/`POST` and scopes each to the workspace (+ `deletedAt` where present).
     Its target types are `InteractionTargetType`; map `EditProposal.targetType`
     (`NODE|EDGE|ONTOLOGY`) → the corresponding check. `ONTOLOGY` has **no** interaction target
     type, so for `ONTOLOGY` call `ontologyRepo.findClassById(targetId, workspaceId, tid)` and treat
     `null` as not-found.
   - **(b) Add `IOntologyRepository.findClassById` (already workspace-scoped) for ONTOLOGY and a
     small `findByIdInWorkspace` on the node/edge ports** if you prefer not to couple proposal
     creation to the interaction port. `INodeRepository`/`IEdgeRepository` already have
     `findById(id, tid)` and `findByWorkspace`; a `findById` + explicit
     `workspaceId === input.workspaceId` comparison is acceptable **only if** you compare before
     persisting (the object's `workspaceId` is exposed on the domain entity).
   Whichever you choose, **do not** create a third duplicate switch.
2. In `CreateProposalUseCase`, after building the proposal inputs and **before** `proposalRepo.save`,
   verify the target; on failure throw:
   - `ERR_NODE_NOT_FOUND` for `NODE`, `ERR_EDGE_NOT_FOUND` for `EDGE`,
   - `ERR_VALIDATION_FAILED` for `ONTOLOGY` (no dedicated `ERR_ONTOLOGY_NOT_FOUND` exists — keep
     the message `ontology class <id> not found` to match `ActivateOntologyClassUseCase`).
3. Add the required ports to the constructor (manual wiring in `server.ts`); `CreateProposalUseCase`
   currently receives only `proposalRepo` + `eventPublisher`.
4. Add `apps/api/tests/application/CreateProposalUseCase.test.ts` with in-memory fakes:
   - a target in the same workspace → proposal saved;
   - a target that does not exist → 404, and `save` is **not** called;
   - a target in another workspace → 404, and `save` is **not** called.

## 6. Constraints & gotchas
- Do **not** add a DB foreign key here — that is the separate `M-12` migration task.
- Do **not** validate `proposedChanges` shape (TASK-09 whitelists on apply).
- Keep the `PROPOSAL_CREATED` event and the 201 response shape unchanged.
- The check must be a single round-trip where possible; do not load the whole target entity if a
  `select({ id }).limit(1)` suffices.

## 7. Acceptance criteria
- [ ] `POST /api/v1/proposals` with a nonexistent `targetId` → 404 (type-appropriate code), no row.
- [ ] `POST /api/v1/proposals` with a `targetId` in another workspace → 404, no row.
- [ ] A valid same-workspace target still creates the proposal (201).
- [ ] `pnpm --filter @vozlab/api test` passes, including the new test file.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
pnpm --filter @vozlab/api test
pnpm turbo run build
# with the API running (TASK-32):
# curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/v1/proposals \
#   -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS" -H 'content-type: application/json' \
#   -d '{"targetId":"00000000-0000-4000-8000-000000000000","targetType":"NODE","proposedChanges":{}}'
# → 404
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-33` `[x]` in `TODO.md` with a one-line result note naming the reuse
  shape chosen (a or b) so TASK-35 follows the same pattern.

## 10. Out of scope
- The `edit_proposals.target_id` FK (`M-12`, separate migration task).
- Resolving the proposal (`TASK-22` already scopes that).
