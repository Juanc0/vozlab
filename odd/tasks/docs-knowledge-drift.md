# Feature: docs-knowledge-drift

Branch: chore/docs-knowledge-drift. Goal: reconcile docs/knowledge/ and related living docs with the code (code is authoritative), applying the committee's prioritized drift fixes without touching application code.

## Specs

S1 — Dependency lifecycle tables reflect post-upgrade reality. Quote: "Reescribir las tablas de `dependency-lifecycle.md` §2-§4 con el estado post-waves (o marcarlas 'históricas pre-wave')." Acceptance: every row in §2 (platform/runtime), §3 (node packages), §4 (dead code) matches installed versions in node_modules/uv.lock and the executed waves 0-4; stale rows (Node 22, Fastify 4, redis 4, Zod 3, jose 5, ESLint 8, pnpm 12.11, cytoscape present, d3 in devDeps) are corrected or explicitly marked historical with a date. Evidence lands in docs/knowledge/dependency-lifecycle.md.

S2 — Ontology governance gap table reflects closed items. Quote: "Marcar como cerrado en `data-and-db.md` §2 la fila de `system_key`." Acceptance: the "system_key not unique" row in data-and-database-operations.md §2 is moved to a "closed (G7)" state; the G8 row in internationalization-strategy.md is changed from "to confirm" to "closed". Evidence lands in both files.

S3 — Ontology state machine labeled as proposed. Quote: "Etiquetar como 'propuesto, no implementado' el stateDiagram de `graph-and-ontology-strategy.md` §4." Acceptance: the stateDiagram in §4 carries an explicit "proposed, not implemented" label and the gap table (G1-G9) remains the source of truth for implemented status. Evidence lands in docs/knowledge/graph-and-ontology-strategy.md.

S4 — Web canvas documentation reflects SVG painter. Quote: "Corregir `web-pwa.md` y ROADMAP: 'Cytoscape' → 'SVG painter (d3-force)'." Acceptance: docs/components/web-pwa.md and ROADMAP.md no longer describe the canvas as Cytoscape; they name SvgGraphCanvas.svelte + d3-force; any remaining cytoscape mentions are confined to archive/ or graph-engine-research.md (historical). Evidence lands in docs/components/web-pwa.md and ROADMAP.md.

S5 — Knowledge index distinguishes graduation paths. Quote: "Distinguir en el índice de knowledge los paths de graduación (abierto / archivado / no abierto)." Acceptance: docs/knowledge/README.md graduation table marks each target plan as open / archived / not-yet-opened, matching docs/plans/ and docs/archive/plans/. Evidence lands in docs/knowledge/README.md.

S6 — AI pipeline F-01 clarification. Quote: "Clarificar estado de F-01 en `ai-pipeline.md` (edges PENDING aprobables vs nodes PENDING del extractor sin flujo dedicado)." Acceptance: ai-pipeline-and-models.md §2 states explicitly which agent-created artefacts have an approval path (edges via proposals) and which do not (extractor-created PENDING nodes), citing the relevant controllers. Evidence lands in docs/knowledge/ai-pipeline-and-models.md.

S7 — Security compose verification. Quote: "Verificar S-05 contra `docker-compose.yml` actual y actualizar security-baseline." Acceptance: security-baseline.md S-05 row reflects the current docker-compose.yml port bindings (verified by reading the file), with a dated note. Evidence lands in docs/knowledge/security-baseline.md.

S8 — Docs hygiene gate green. Quote: "bash scripts/docs-hygiene.sh green." Acceptance: running bash scripts/docs-hygiene.sh after all edits reports green (links, heredoc artifacts, dead refs, process debris). No new broken links introduced.

## Tasks

T1 | S1 | inline | commit: chore(docs): refresh dependency-lifecycle tables to post-wave state
T2 | S2,S3 | inline | commit: docs(knowledge): mark closed ontology gaps and label proposed state machine
T3 | S4 | inline | commit: docs(web): replace Cytoscape canvas references with SVG painter
T4 | S5,S6 | inline | commit: docs(knowledge): clarify graduation paths and F-01 approval status
T5 | S7 | inline | commit: docs(security): verify S-05 against current compose
T6 | S8 | inline | commit: docs(hygiene): verify links and debris after knowledge drift fixes

## Log

L1: usa tu propio flujo que consideres para abordar todas las tareas que indicaste.
L2: (exploration) revisar docs/knowledge/ y comparar contra código de api y web; verificar actualización; sugerencias de secciones a actualizar/ajustar/acotar; sin cambios internos.
L3: autorización de implementación concedida; rama chore/docs-knowledge-drift creada; feature doc odd/tasks/docs-knowledge-drift.md creado.
