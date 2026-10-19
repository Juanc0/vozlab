# TASK-11 — Subgraph Endpoint `GET /api/v1/nodes/subgraph` (NFR-01)

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-10 · **Size:** L
> **Self-contained:** yes.

## 1. Context
NFR-01: *subgraph queries for the PWA (< 200 nodes) must respond `p95 < 30 ms`*. The frontend
(MILESTONE-3.4, Cytoscape.js) and the stress test (MILESTONE-4.4, k6) both call
`GET /api/v1/nodes/subgraph`, which does not exist yet.

Data model: `public.nodes (id, workspace_id, type_key, title, ..., deleted_at)` and
`public.edges (id, workspace_id, source_node_id, target_node_id, relation_key, attributes,
status, ..., deleted_at)`. Indexes `idx_edges_source` and `idx_edges_target` already exist,
plus `idx_nodes_workspace_status` (partial, `deleted_at IS NULL`).

## 2. Objective
Add a workspace-scoped subgraph endpoint returning a bounded set of nodes and the edges among
them, suitable for a single Cytoscape render.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; every repository call takes `tid`.
- Cursor/pagination rules (NFR-04) apply; the subgraph is bounded by `depth` and `limit`.
- Errors via `DomainError`/`sendError`/`mapDomainError` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | use case | `apps/api/src/application/use_cases/GetSubgraphUseCase.ts` |
| Edit | port | `apps/api/src/domain/ports/INodeRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Create | schema | `packages/shared-types/src/schemas/subgraph.schema.ts` (+ export in `index.ts`) |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/NodeController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Add to `INodeRepository` a method that returns the subgraph in one adapter call:
   ```ts
   getSubgraph(
     rootId: string,
     workspaceId: string,
     opts: { depth: number; limit: number },
     tid: string
   ): Promise<{ nodes: Node[]; edges: { id: string; sourceNodeId: string; targetNodeId: string; relationKey: string; status: string }[] }>;
   ```
2. Implement with a **recursive CTE** (or iterative BFS, but a CTE is preferred) in the Drizzle
   adapter. The CTE must:
   - start from `rootId` (must be in the same `workspace_id`);
   - expand along `edges` up to `depth` hops (cap `depth` at, say, 3);
   - filter `deleted_at IS NULL` on both nodes and edges;
   - stop after `limit` nodes (cap at 200 per NFR-01).
   Then fetch all edges whose **both** endpoints are in the resulting node set.
   Use `sql` from `drizzle-orm` for the CTE and map rows to domain `Node` entities via the
   existing mapper.
3. Add a Zod schema `SubgraphQuerySchema`:
   `{ rootId: uuid, depth: coerce.number().int().min(0).max(3).default(1), limit: coerce.number().int().min(1).max(200).default(100) }`.
4. `GetSubgraphUseCase(execute({ rootId, workspaceId, tid, depth, limit }))`:
   - if the root does not exist → `DomainError('ERR_NODE_NOT_FOUND')`;
   - returns `{ nodes, edges }`.
5. `NodeController.getSubgraphHandler`: validate the query with the schema, use
   `getRequestContext`, return `{ nodes: [...], edges: [...] }` with plain DTOs (string hashes).
6. Register `GET /api/v1/nodes/subgraph` in `routes.ts` **before** `GET /api/v1/nodes/:id`
   (Fastify static routes should be declared before the parameterised one to avoid shadowing).
   Wire the use case in `server.ts`.

## 6. Constraints & gotchas
- Keep the query workspace-scoped and soft-delete aware.
- Never return embeddings or `AuthorHash` objects.
- Cap the returned node count so a pathological graph cannot blow up memory (NFR-01).
- Ensure the CTE does not recurse infinitely on cycles (limit by depth, not by visited set alone
  — or track visited ids).

## 7. Acceptance criteria
- [ ] `GET /api/v1/nodes/subgraph?rootId=...&depth=1` returns the root, its 1-hop neighbours and the connecting edges.
- [ ] Unknown root → 404 `ERR_NODE_NOT_FOUND`.
- [ ] Response never exceeds the `limit`/`200` cap and excludes soft-deleted rows.
- [ ] Route is registered before `/nodes/:id`.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
curl -s -H "Authorization: Bearer $JWT" -H "X-Workspace-ID: $WS" \
  "http://localhost:3000/api/v1/nodes/subgraph?rootId=$NODE&depth=2&limit=100"
```

## 9. Definition of done / handoff
- Build passes and the endpoint returns a correct bounded subgraph.
- Mark `TASK-11` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- AGE/Cypher traversal, layout computation (that is frontend), and k6 benchmarking.
