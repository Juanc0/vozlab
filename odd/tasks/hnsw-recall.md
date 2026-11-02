# Feature: hnsw-recall

Branch: chore/docs-knowledge-drift. Plan: docs/plans/hnsw-recall/v1.md. Goal: fix F-04 filtered-recall defect in the Relator's neighbour query.

## Specs

S1 — Integration test (RED) for recall. Acceptance: a test seeds a multi-workspace dataset with skewed sizes, runs the neighbour query (HNSW) and an exact query (SET enable_indexscan = off), and asserts recall >= 0.95 on the top-5 per workspace. Evidence: apps/api/tests/integration/ (new file) + docs/knowledge/data-and-database-operations.md §4.

S2 — Fix neighbor query. Acceptance: findNearestInWorkspace runs inside a transaction with SET LOCAL hnsw.iterative_scan = relaxed_order and a suitable hnsw.ef_search. Evidence: DrizzleNodeRepository.ts + docs/knowledge/data-and-database-operations.md §4.

S3 — Confirm pgvector >= 0.8.0 in the image. Acceptance: docker/postgres/Dockerfile pins pgvector >= 0.8.0 and the check is documented. Evidence: Dockerfile + docs/knowledge/dependency-lifecycle.md §2.

S4 — Update living doc. Acceptance: data-and-database-operations.md §4 records the fix, measured recall, and verification command. Evidence: docs/knowledge/data-and-database-operations.md §4.

## Tasks

T1 | S1 | worker | commit: test(api): add HNSW recall regression test (RED)
T2 | S2 | worker | commit: fix(api): restore filtered recall via iterative scan
T3 | S3 | worker | commit: chore(devops): pin pgvector >= 0.8.0 in postgres image
T4 | S4 | inline | commit: docs(data): record F-04 fix and measured recall

## Log

L1: abrimos el plan hnsw-recall v1 y ejecutamos con subagent-driven-development (elegido por el usuario).
L2: plan abierto en docs/plans/hnsw-recall/v1.md; registrado en ROADMAP "Tracked, not scheduled".
L3: implementación completada. Commit 31f1d65 (5 archivos, 302 insertions, 13 deletions). T1 test creado (pasa, no RED en dev env); T2 fix aplicado (iterative scan en transacción); T3 pgvector pin en Dockerfile (build-time check); T4 §4 actualizado. neighbors + neighbors-recall integration tests pass (7 tests). Type-check/build de src/ limpio para DrizzleNodeRepository.ts; gate global rojo por WIP tenant-user-management (no causado por este cambio). Slice boundary: 532 líneas en 4 commits desde origin/main (past ~400).
