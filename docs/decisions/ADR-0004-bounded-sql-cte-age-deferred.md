# ADR-0004: Bounded recursive SQL CTE for subgraphs; Apache AGE deferred

- Status: Accepted
- Date: 2026-10-19
- Supersedes: the assumption in `docs/archive/spec-v1/00_ARCHITECTURE_OVERVIEW.md` and `modules_01` §4 that Apache AGE/Cypher is the subgraph read path.

## Context

NFR-01 requires a workspace-scoped subgraph for the PWA (fewer than 200 nodes) to respond at p95 < 30 ms. The implemented read path is a recursive CTE over `public.edges`, followed in both directions. The first version was bounded by depth only, so a dense hub could materialize an unbounded intermediate set, and the traversal indexes were single-column, so `workspace_id` and `deleted_at` were not index-covered.

The specification also names Apache AGE with openCypher. The graph `vozlab_graph` and its labels exist in the tenant database, but nothing mirrors `public.nodes`/`public.edges` into AGE and no adapter issues Cypher.

## Decision

The subgraph read path remains a recursive SQL CTE over the relational tables.

- `depth` is capped at 3 and `limit` at 200, both in the shared query schema and again in the adapter. Each edge direction and each recursive step carries a `LIMIT`, and the outer query keeps its own `LIMIT`, so the working set is `O(limit * depth)`.
- The traversal is workspace-scoped and filters `deleted_at IS NULL` on nodes and edges. `UNION` (not `UNION ALL`) deduplicates `(id, depth)` and terminates cycles.
- The edge indexes are workspace-covering partial indexes: `idx_edges_workspace_source (workspace_id, source_node_id) WHERE deleted_at IS NULL` and `idx_edges_workspace_target (workspace_id, target_node_id) WHERE deleted_at IS NULL`.
- `EXPLAIN ANALYZE` on PostgreSQL 18.6, with 5,000 nodes and 20,000 edges, showed index scans on both indexes and no sequential scan on `edges`.
- Apache AGE is deferred to its own milestone: Cypher adapter, mirroring on every node/edge mutation, reconciliation and backfill of existing rows. Do not add AGE writes or a Cypher adapter piecewise before that milestone.

## Consequences

### Positive

- One source of truth: nodes and edges are written once, relationally; there is no dual write or projection lag.
- The query is index-covered and its row growth is bounded by `limit * depth`.
- No AGE reconciliation/backfill work is needed for the current read path.

### Negative / costs

- There is no Cypher surface for multi-hop analytics; those queries must be expressed in SQL.
- The AGE graph exists but is empty, which can mislead a reader of the specification until the deferred milestone runs.
- Adopting AGE later requires a backfill, a reconciliation process and a second write path; that cost is intentionally postponed, not avoided.

## Links

- `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` (`getSubgraph`)
- `packages/shared-types/src/schemas/subgraph.schema.ts`
- `packages/database/src/schema/tenant.public.schema.ts` (edge indexes)
- `packages/database/migrations/tenant/0001_*.sql`
- `docs/archive/spec-v1/modules/modules_01_data_model_and_metamodel.md` §4
- `docs/archive/tasks/TASK-29_subgraph-bounding-and-age-decision.md`
- `docs/archive/history/TODO-phase-1T.md` — TASK-29 result note
