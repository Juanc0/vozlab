# TASK-23 — Real Proposal Read Endpoints (`GET /proposals[/:id]`)

> **Batch:** Phase 1S.1 (Correctness) · **Depends on:** TASK-22, TASK-24 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`routes.ts` still answers the two read routes with **hard-coded empty payloads**:

```ts
app.get('/api/v1/proposals',      async (_req, reply) => reply.status(200).send({ proposals: [] }));
app.get('/api/v1/proposals/:id',  async (_req, reply) => reply.status(200).send({ proposal: null }));
```

This violates `EXECUTION_PLAN.md` **MILESTONE-1R.3** ("no hard-coded empty payloads") and
`IProposalRepository` has no listing method at all. TASK-16 exported `ProposalStatusSchema`
and `TargetTypeSchema` in `@vozlab/shared-types` — use them for the query key.

## 2. Objective
Implement workspace-scoped, cursor-paginated proposal reads (list + by id) backed by the
repository, wired through the composition root, with the stubs deleted.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: relative imports end in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Reads are O(1) keyset — never `OFFSET`. Reuse the shared keyset helper from **TASK-24**
  (`apps/api/src/infrastructure/persistence/keyset.ts`); if that file does not exist yet,
  stop and do TASK-24 first.
- Foreign-workspace rows are invisible: a proposal in another workspace → 404, not 403.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/shared-types/src/schemas/proposal.schema.ts` (`ListProposalQuerySchema` + DTO type) |
| Edit | `apps/api/src/domain/ports/IProposalRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleProposalRepository.ts` |
| Create | `apps/api/src/application/use_cases/ListProposalsUseCase.ts` |
| Create | `apps/api/src/application/use_cases/GetProposalUseCase.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/ProposalController.ts` |
| Edit | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. **Shared types.** In `proposal.schema.ts` add:
   ```ts
   export const ListProposalQuerySchema = z.object({
     status: ProposalStatusSchema.optional(),
     targetType: TargetTypeSchema.optional(),
     limit: z.coerce.number().int().min(1).max(100).default(20),
     cursor: z.string().optional(),
   });
   export type ListProposalQueryInput = z.infer<typeof ListProposalQuerySchema>;
   ```
2. **Port.** In `IProposalRepository` add:
   ```ts
   findByIdInWorkspace(id: string, workspaceId: string, tid: string): Promise<EditProposal | null>;
   findByWorkspace(workspaceId: string, opts: { status?: ProposalStatus; targetType?: TargetType; limit: number; cursor?: string }, tid: string): Promise<{ items: EditProposal[]; nextCursor: string | null }>;
   ```
   Import `TargetType` from the domain entity (already exported) — do not duplicate it.
3. **Adapter.** Implement both in `DrizzleProposalRepository` using the TASK-24 helper
   (`encodeCursor`/`decodeCursor` + the shared `buildKeysetConditions`). Order by
   `createdAt DESC, id DESC`; filter by `workspaceId`, optional `status`, optional
   `targetType`; fetch `limit + 1` to compute `nextCursor`. `findByIdInWorkspace` adds
   `eq(editProposals.workspaceId, workspaceId)`. Keep `findById` for the existing mutation
   flows.
4. **Use cases.**
   - `ListProposalsUseCase.execute({ workspaceId, status?, targetType?, limit, cursor?, tid })`
     → delegates to `findByWorkspace`.
   - `GetProposalUseCase.execute({ proposalId, workspaceId, tid })` → `findByIdInWorkspace`;
     `null` → `throw new DomainError('ERR_PROPOSAL_NOT_FOUND')`.
5. **Controller.** Add `list(req, reply)` and `get(req, reply)` to `ProposalController`:
   parse `ListProposalQuerySchema` for the list; read `:id` for get; `getRequestContext`,
   `ERR_MISSING_WORKSPACE_HEADER` when null; map `EditProposal` to a stable DTO
   (`id, workspaceId, targetId, targetType, status, communityScore, justification,
   proposerHash, resolvedBy, resolvedAt, createdAt`) — **never** emit the raw `AuthorHash`
   object, call `.toString()`. List body `{ proposals, nextCursor }`, get body `{ proposal }`.
   Reuse the existing `handleError`.
6. **Composition root.** Construct both use cases in `server.ts` (they only need
   `proposalRepo`) and add them to `RouteDependencies`.
7. **Routes.** Replace the two stub handlers with `proposalController.list` / `.get`.
   Keep `/proposals` static routes before the parameterised ones (they already are).

## 6. Constraints & gotchas
- Do not return `proposedChanges` unvalidated in the DTO unless you also confirm it is a plain
  object; `EditProposal.proposedChanges` is `Record<string, any>` — pass it through as-is.
- `authorHash`/`proposerHash`/`resolvedBy` are pseudonyms; emitting the 64-hex string is
  intended (NFR-07) — never the salt or the raw identity.
- A malformed `cursor` must yield `ERR_VALIDATION_FAILED` (422), not an empty first page
  (the shared helper already does this — do not swallow it).
- Empty results are `{ proposals: [], nextCursor: null }` — that is a real result, not a stub.

## 7. Acceptance criteria
- [ ] `GET /api/v1/proposals` returns the workspace's proposals with keyset pagination and honors `status`/`targetType` filters.
- [ ] `GET /api/v1/proposals/:id` returns the proposal or 404 `ERR_PROPOSAL_NOT_FOUND`.
- [ ] A proposal of another workspace → 404 (not returned, not 403).
- [ ] `routes.ts` contains no `{ proposals: [] }` / `{ proposal: null }` literals.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "proposals: \[\]\|proposal: null" apps/api/src/infrastructure/http/routes.ts || echo "stubs removed"
pnpm turbo run build
# with the API running (TASK-18/19):
# TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer | tail -1)
# curl -s "localhost:3000/api/v1/proposals?limit=20" -H "Authorization: Bearer $TOKEN" \
#   -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333"
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-23` `[x]` in `TODO.md`, noting the two routes are now real.

## 10. Out of scope
- Voting/commenting on proposals (already covered by `POST /interactions`).
- Filtering by `proposerHash` (add later only if the docs require it).
