# docs/knowledge/

Deep explanatory material about **how and why** — content that is not yet
realized (or not fully realized) as code, and therefore has no home in the
living reference set. Each file declares its *graduation path*: the future
plan (`plans/<area>/v<N>.md`) that turns it into implemented, documented
reality. When a file is fully absorbed, it moves to `docs/archive/`.

| File | Subject | Graduates when |
| --- | --- | --- |
| [data-and-database-operations.md](data-and-database-operations.md) | The filtered-HNSW recall defect (F-04) + fix design, fleet data-layer requirements (migration runner, connection arithmetic, provisioning, backup/restore), personal-data erasure options (D-15) | `plans/vector-search/` and `plans/fleet-data-layer/` (not yet opened) |
| [ai-pipeline-and-models.md](ai-pipeline-and-models.md) | Model shortlists, the evaluation instrument (dataset/metrics/decision rule), provenance and injection controls | `plans/eval-harness/`, `plans/extractor/` (the normative task specs are `docs/archive/guia-identidad-ia/02-tareas-para-modelo-pequeno.md` block E + `ai-worker-tasks/A4–A5`) |
| [graph-and-ontology-strategy.md](graph-and-ontology-strategy.md) | Ontology governance gaps G1–G9 + state machine, storage-engine comparison, outbox-before-projection rule | `plans/ontology-governance/`, `plans/age-mirror/` |
| [dependency-lifecycle.md](dependency-lifecycle.md) | Upgrade waves (Fastify 5, node-redis 6, Zod 4, jose), dead-Cytoscape inventory | `plans/upgrade-waves/` |
| [internationalization-strategy.md](internationalization-strategy.md) | Six-places framework, content-language (lang column) plan, Spanish masking gaps | `plans/i18n-content/` |
| [security-baseline.md](security-baseline.md) | Threat model, controls-sound checklist, open S-items (S-02/03/04/05/12/15) | each S-item closed → recorded here or in an ADR; the document is the standing audit baseline, not a plan |

Provenance: carried 2026-10-29 from the frozen `knowledge-transfer/` pack
(then dated 2026-10-23); files were verified against code the same day — the
open items named above were re-confirmed present. The rest of the pack is at
`docs/archive/knowledge-transfer/`.
