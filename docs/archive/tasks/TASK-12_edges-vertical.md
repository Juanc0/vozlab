# TASK-12 — Edges Vertical: Complete Repository, Use Cases, Controller, Routes

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-09, TASK-10 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-08 requires creating typed, directed edges between two existing nodes, validating the
domain/range restrictions of the active ontology. The domain already has:
- `Edge` entity with `changeStatus` (`DRAFT→PENDING/ACTIVE`, `PENDING→ACTIVE/REJECTED`,
  `ACTIVE→REJECTED`), `updateAttributes`, `softDelete`.
- Port `IEdgeRepository`: `findById`, `findByWorkspace`, `save`, `softDelete`
  (+ `applyDelta` added by TASK-09).
- Adapter `DrizzleEdgeRepository` (scoped by `tid`, `client(tid, tx?)` helper).
- Use case `CreateEdgeUseCase` (validates nodes exist + optional ontology domain/range,
  creates `PENDING`, publishes `EDGE_CREATED`).
- Controller `EdgeController` (uses `getRequestContext` / `sendError` / `mapDomainError`).

**What is missing:** the vertical is **not wired**. `routes.ts` registers no `/edges` route and
`server.ts` never instantiates `DrizzleEdgeRepository`, `CreateEdgeUseCase` or `EdgeController`.
There are also no read/update/delete use cases.

## 2. Objective
Wire the edges vertical end-to-end and complete it with list/get/update/soft-delete endpoints.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; adapters take `tid` and reuse `tx`; manual Composition Root.
- Events are post-commit and best-effort; event name `EDGE_CREATED`/`EDGE_UPDATED`/`EDGE_DELETED`.
- Errors via `DomainError` + `sendError`/`mapDomainError` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Edit | port | `apps/api/src/domain/ports/IEdgeRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleEdgeRepository.ts` |
| Create | use case | `apps/api/src/application/use_cases/GetEdgeUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/ListEdgesUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/UpdateEdgeUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/DeleteEdgeUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/CreateEdgeUseCase.ts` (DI + DomainError) |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/EdgeController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Confirm/extend `IEdgeRepository`:
   - `findByWorkspace(workspaceId, tid)` already returns all non-deleted edges; add cursor
     pagination like TASK-10 did for nodes:
     `listByWorkspace(workspaceId, { limit, cursor }, tid): Promise<{ items: Edge[]; nextCursor: string | null }>`.
     Reuse the same keyset (`createdAt DESC, id DESC`) encoding strategy.
2. Implement `listByWorkspace` in `DrizzleEdgeRepository` (filter `deleted_at IS NULL`).
3. Use cases (each: fetch scoped by `workspaceId`, throw `DomainError` when missing,
   publish the relevant event post-commit where applicable):
   - `GetEdgeUseCase({ edgeId, workspaceId, tid })`.
   - `ListEdgesUseCase({ workspaceId, tid, limit, cursor })`.
   - `UpdateEdgeUseCase({ edgeId, workspaceId, tid, relationKey?, attributes?, authorHash })`:
     only the edge author may update (compare `edge.authorHash.toString() === authorHash`),
     else `DomainError('ERR_AUTHORIZATION_FAILED')`; use `edge.updateAttributes` + set
     `relationKey`; persist via `edgeRepo.save(...)`; publish `EDGE_UPDATED`.
   - `DeleteEdgeUseCase({ edgeId, workspaceId, tid, authorHash })`: same authorization;
     `edge.softDelete()` / `edgeRepo.softDelete`; publish `EDGE_DELETED`.
4. `EdgeController`: add `get`, `list`, `update`, `delete` handlers following the existing
   `create` style. Validate bodies with `CreateEdgeSchema`/`UpdateEdgeSchema` from
   `@vozlab/shared-types`. Return plain DTOs (ids, relationKey, status, attributes), never
   `AuthorHash` objects.
5. `routes.ts`: register
   - `POST /api/v1/edges`
   - `GET /api/v1/edges` (query: limit/cursor)
   - `GET /api/v1/edges/:id`
   - `PATCH /api/v1/edges/:id`
   - `DELETE /api/v1/edges/:id`
   all behind the guard chain `[auth, workspace, limit]`.
6. `server.ts`: instantiate `DrizzleEdgeRepository(poolManager)`, the four use cases, and pass
   them to `registerRoutes` (extend `RouteDependencies`).

## 6. Constraints & gotchas
- Edge creation already sets status `PENDING` (governance applies). Do not auto-activate.
- `CreateEdgeUseCase` needs `IEdgeRepository`, `INodeRepository`, `IOntologyRepository`,
  `IEventPublisher`; wire all four.
- Do not introduce a separate `PUT` and `PATCH`; use `PATCH` for partial updates.
- Soft-delete only (`deletedAt`), never a hard `DELETE`.
- Keep the domain/range validation behaviour of `CreateEdgeUseCase` as-is (only enforced when
  the object property exists).

## 7. Acceptance criteria
- [ ] `routes.ts` registers the five `/edges` routes behind the guard chain.
- [ ] `server.ts` wires the edge repo + use cases (no dead code left).
- [ ] `PATCH`/`DELETE` by a non-author → 403; by the author → succeeds.
- [ ] Approving an `EDGE` proposal (TASK-09) targets an edge created here.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -n "'/api/v1/edges" apps/api/src/infrastructure/http/routes.ts
```

## 9. Definition of done / handoff
- Build passes; the five routes work; the vertical is fully wired.
- Mark `TASK-12` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Edge embedding/similarity, AGE mirroring, and batch edge ingestion.
