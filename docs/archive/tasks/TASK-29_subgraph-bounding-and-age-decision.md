# TASK-29 — Bound the Subgraph CTE + Index Tuning + Apache AGE Decision

> **Batch:** Phase 1S.3 (Policy) · **Depends on:** TASK-02 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`DrizzleNodeRepository.getSubgraph` (NFR-01) uses a recursive CTE over `public.edges`, followed
in both directions. It is bounded by **`depth`** (`MAX_SUBGRAPH_DEPTH = 3`) and by a final
`LIMIT` (`MAX_SUBGRAPH_NODES = 200`), but the **recursive terms are unbounded by rows**: a dense
hub can expand to millions of intermediate rows before the outer `LIMIT` applies. The traversal
indexes are also single-column (`idx_edges_source`, `idx_edges_target`), so the
`workspace_id + deleted_at` filters are not index-covered.

Separately, `docs/00_ARCHITECTURE_OVERVIEW.md` / `modules_01 §4` specify **Apache AGE + openCypher**
for graph traversal; it is **not implemented** (the `vozlab_graph` graph and labels exist in
`packages/database/scripts/02-extensions-and-graph.sql` but nothing mirrors nodes/edges into it
and no adapter issues Cypher). This is a specification decision that must be recorded, not a
silent omission.

## 2. Objective
Harden the SQL subgraph traversal (row-bounded recursion + workspace-covering indexes, verified
with `EXPLAIN ANALYZE`) and record the decision to keep the SQL CTE for the read path while
scheduling AGE/Cypher as its own deferred milestone.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Migrations are generated, never hand-edited: `pnpm --filter @vozlab/database db:generate:tenant`.
- Keep the existing clamps (`depth ≤ 3`, `limit ≤ 200`) and the `UNION` (dedup) semantics.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Edit | `packages/database/src/schema/tenant.public.schema.ts` (edge indexes) |
| Create | `packages/database/migrations/tenant/0001_*.sql` (generated) |
| Edit | `docs/modules/modules_01_*.md` (§4 traversal) |
| Edit | `EXECUTION_PLAN.md` (Deferred list) |

## 5. Step-by-step instructions
1. **Row-bound the recursion.** In the CTE, add `LIMIT ${limit}` to **both** recursive branches
   (the `e.source_node_id = r.id` term and the `e.target_node_id = r.id` term) and keep the final
   outer `LIMIT ${limit}`. This caps per-depth fan-out so a hub cannot materialise an unbounded
   intermediate set; combined with `depth ≤ 3` the worst case is `O(limit · depth)` rows.
   Keep the existing `deleted_at IS NULL` / `workspace_id` predicates on every join.
2. **Index the traversal.** In `tenant.public.schema.ts` replace the single-column indexes with
   workspace-covering partial indexes:
   ```ts
   index('idx_edges_workspace_source')
     .on(table.workspaceId, table.sourceNodeId)
     .where(sql`${table.deletedAt} IS NULL`),
   index('idx_edges_workspace_target')
     .on(table.workspaceId, table.targetNodeId)
     .where(sql`${table.deletedAt} IS NULL`),
   ```
   Remove `idx_edges_source` / `idx_edges_target` (they are subsumed). Run
   `pnpm --filter @vozlab/database db:generate:tenant` and commit the generated migration.
   **Note:** a plain drizzle-kit `generate` will emit `CREATE INDEX` (not `DROP` + `CREATE` with
   the same names) because the names change — verify the SQL contains the two new names and the
   two `DROP INDEX` statements, and that it is non-destructive.
3. **Prove it.** Document the verification in the task result note:
   ```sql
   EXPLAIN ANALYZE
   WITH RECURSIVE reachable(id, depth) AS ( … same query as the repo … )
   SELECT id, MIN(depth)::int FROM reachable GROUP BY id ORDER BY MIN(depth), id LIMIT 200;
   ```
   Confirm the plan uses `idx_edges_workspace_source` / `idx_edges_workspace_target` and no
   sequential scan on `edges`. Paste the key plan lines into the TODO result note.
4. **Record the AGE decision.** In `docs/modules/modules_01 §4`, after the traversal design,
   add a **Decision** note: *the read path uses the bounded SQL recursive CTE; Apache AGE/Cypher
   is deferred to its own milestone (mirroring + reconciliation + Cypher adapter), because it
   requires dual-write and a backfill and is not needed for the bounded subgraph view.* Add the
   same line to `EXECUTION_PLAN.md` under "Deferred (tracked)".

## 6. Constraints & gotchas
- Do not drop or rename existing **nodes** indexes (`idx_nodes_workspace_status`,
  `idx_nodes_embedding_hnsw`, `idx_nodes_attributes_gin`).
- Do **not** implement AGE mirroring, dual-write or Cypher in this task — decision + bounding only.
- Backfilling the new indexes is a migration concern; do not add a runtime `CREATE INDEX`.
- `LIMIT` inside a recursive term is supported by PostgreSQL 18 (this repo's image) — do not
  fall back to a loop in application code.
- Keep the query parameterised (`sql` template) — no string interpolation of ids.

## 7. Acceptance criteria
- [ ] Both recursive terms carry a `LIMIT`; the outer `LIMIT` remains.
- [ ] The generated tenant migration adds `idx_edges_workspace_source` / `idx_edges_workspace_target` and drops the two single-column indexes.
- [ ] `EXPLAIN ANALYZE` shows index usage on `edges` (no seq scan) for the subgraph query.
- [ ] The AGE decision is in `modules_01 §4` and `EXECUTION_PLAN.md` (Deferred).
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
pnpm --filter @vozlab/database db:generate:tenant
grep -n "idx_edges_workspace_source\|idx_edges_workspace_target" packages/database/migrations/tenant/*.sql
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-29` `[x]` in `TODO.md` with the `EXPLAIN` evidence
  (index names + "no seq scan on edges") and the AGE decision.

## 10. Out of scope
- Implementing Apache AGE / Cypher / graph mirroring (deferred milestone).
- Changing the subgraph output shape or the depth/limit clamps.
