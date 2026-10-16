# TASK-10 — Nodes Vertical: Controller Consistency, Reads, Pagination, Ontology Validation

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-06, TASK-08 · **Size:** L
> **Self-contained:** yes.

## 1. Context
The node endpoints are partially stubbed and inconsistent:
- `GET /api/v1/nodes` returns a hard-coded `{ nodes: [] }`; `GET /api/v1/nodes/:id` returns
  `{ node: null }` (`apps/api/src/infrastructure/http/routes.ts`).
- `NodeController` has its own context extraction and maps domain errors to 500 instead of
  using the shared `getRequestContext` / `sendError` / `mapDomainError` helpers that the newer
  controllers use.
- Node creation does **not** validate `typeKey` against the workspace's active ontology
  (FR-06 / US-01 AC#1: the form is built from `meta.datatype_properties`; the server must at
  least reject unknown types).
- NFR-04 requires **cursor-based pagination** for all lists.

Facts you need:
- `INodeRepository`: `findById(id, tid)`, `save`, `update`, `applyDelta(...)`; adapter
  `DrizzleNodeRepository` uses a `client(tid, tx?)` helper.
- Ontology reads live on `IOntologyRepository` (`findClassByKey`, `findActiveClasses`,
  `findDatatypeProperties`).
- Errors: `DomainError` + `ERROR_CODES` (TASK-06).
- The `nodes` table has `id, workspaceId, typeKey, title, description, attributes, embedding,
  authorHash, status, communityScore, createdAt, updatedAt, deletedAt`.

## 2. Objective
Complete the node vertical: consistent controllers, real read endpoints with cursor
pagination, and ontology-aware creation.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; adapters take `tid`; manual Composition Root wiring.
- Request context comes from `getRequestContext(req)`; errors from `sendError`/`mapDomainError`.
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | use case | `apps/api/src/application/use_cases/GetNodeUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/ListNodesUseCase.ts` |
| Edit | port | `apps/api/src/domain/ports/INodeRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Edit | use case | `apps/api/src/application/use_cases/CreateNodeUseCase.ts` |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/NodeController.ts` |
| Edit | schema | `packages/shared-types/src/schemas/node.schema.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Add to `INodeRepository`:
   ```ts
   listByWorkspace(
     workspaceId: string,
     opts: { limit: number; cursor?: string },
     tid: string
   ): Promise<{ items: Node[]; nextCursor: string | null }>;
   ```
   Implement in the Drizzle adapter with keyset pagination ordered by `(createdAt DESC, id DESC)`:
   - `WHERE workspace_id = $ws AND deleted_at IS NULL`
     `AND (created_at, id) < (cursorCreatedAt, cursorId)` when a cursor is provided;
   - `LIMIT limit + 1` to detect a next page; the cursor is an opaque string encoding
     `createdAt` + `id` (e.g. base64 of `"<iso>|<id>"`). Keep the encode/decode **inside the
     adapter**.
2. Add a query schema to `packages/shared-types` (e.g. `ListNodeQuerySchema` with
   `limit` `z.coerce.number().int().min(1).max(100).default(20)` and optional `cursor` string),
   mirroring the existing style. Export it from `index.ts`.
3. `GetNodeUseCase(execute({ nodeId, workspaceId, tid }))` → `nodeRepo.findById`; if the node
   is null or `node.workspaceId !== workspaceId` throw `DomainError('ERR_NODE_NOT_FOUND')`.
4. `ListNodesUseCase(execute({ workspaceId, tid, limit, cursor }))` → wraps `listByWorkspace`.
5. In `CreateNodeUseCase.execute`, before constructing the node:
   - `const cls = await ontologyRepo.findClassByKey(input.typeKey, input.workspaceId, input.tid)`;
   - if `!cls` or `cls.status !== 'ACTIVE'` → `throw new DomainError('ERR_VALIDATION_FAILED', 'unknown or inactive typeKey')`.
   (Inject `IOntologyRepository` into `CreateNodeUseCase`'s constructor and update the
   Composition Root accordingly.)
6. Refactor `NodeController`:
   - use `getRequestContext(req)` (return `ERR_MISSING_WORKSPACE_HEADER` when null);
   - use `sendError` + `mapDomainError` for every failure;
   - add `getNodeHandler` and `listNodesHandler` returning the domain data (map node → a
     stable JSON DTO; never leak the raw entity internals like `AuthorHash` objects — return
     `authorHash` as a string).
7. Update `routes.ts`: replace the two stub handlers with the new controller methods and
   validate the list query with the new Zod schema. Wire the new use cases in `server.ts`.

## 6. Constraints & gotchas
- Keep the existing successful `POST /api/v1/nodes` response shape.
- Pagination must be **O(1)**: never `OFFSET`.
- The `typeKey` validation must not break system agents (they also post nodes) — validation is
  about the ontology, not identity.
- Return `null`/`[]` semantics exactly as the frontend expects but with real data.

## 7. Acceptance criteria
- [ ] `INodeRepository.listByWorkspace` exists and is keyset-paginated.
- [ ] `GET /api/v1/nodes` returns real paginated nodes + `nextCursor`.
- [ ] `GET /api/v1/nodes/:id` returns the node or a 404 `ERR_NODE_NOT_FOUND`.
- [ ] Creating a node with an unknown/inactive `typeKey` → 422 `ERR_VALIDATION_FAILED`.
- [ ] `NodeController` uses `getRequestContext` + `sendError`/`mapDomainError`; no `'anonymous'` fallback.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
curl -s -H "Authorization: Bearer $JWT" -H "X-Workspace-ID: $WS" "http://localhost:3000/api/v1/nodes?limit=20"
```

## 9. Definition of done / handoff
- Build passes; read endpoints return real data; creation validates the ontology.
- Mark `TASK-10` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- The subgraph endpoint (TASK-11), embeddings generation, and node status transitions UI.
