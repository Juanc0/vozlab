# VozLab — Atomic Task Prompts

Self-contained prompts for independent, low-context models. Each file embeds the context,
constraints and acceptance criteria needed to execute it **without reading the rest of the repo**
(beyond the files it names). The executor must run `pnpm turbo run build` and then mark the task
`[x]` in `TODO.md`.

> Governing docs: `EXECUTION_PLAN.md` (Phase 1R) and `TODO.md`.
> Batch = **Phase 1R: Remediation & Vertical Propagation**.

## Execution order (respect dependencies)

| # | Task file | Depends on |
| --- | --- | --- |
| 01 | `TASK-01_repo-hygiene-and-governance-sync.md` | — |
| 02 | `TASK-02_reset-and-regenerate-drizzle-migrations.md` | 01 |
| 03 | `TASK-03_correlation-id-propagation.md` | 01 |
| 04 | `TASK-04_readiness-probes.md` | 01 |
| 05 | `TASK-05_workspace-membership-enforcement.md` | 02, 04 |
| 06 | `TASK-06_typed-domain-errors.md` | 01 |
| 07 | `TASK-07_rate-limiter-fixed-window.md` | 01 |
| 08 | `TASK-08_proposal-resolution-authorization.md` | 05, 06 |
| 09 | `TASK-09_polymorphic-proposal-application.md` | 08 |
| 10 | `TASK-10_nodes-vertical.md` | 06, 08 |
| 11 | `TASK-11_subgraph-endpoint.md` | 10 |
| 12 | `TASK-12_edges-vertical.md` | 09, 10 |
| 13 | `TASK-13_ontology-vertical.md` | 09, 10 |
| 14 | `TASK-14_discussions-vertical.md` | 06, 10 |
| 15 | `TASK-15_interactions-votes-vertical.md` | 06, 14 |
| 16 | `TASK-16_shared-types-alignment.md` | 06, 10, 15 |
| 17 | `TASK-17_dev-seed-tenant-and-ontology.md` | 02, 05 |

**Suggested first wave (independent):** TASK-01 → TASK-02, TASK-03, TASK-06, TASK-07 →
TASK-04, TASK-05 → TASK-08 → TASK-09 → TASK-10/11/12/13/14/15 → TASK-16, TASK-17.

## How to use one file
1. Start a fresh session (fresh context) with the target model.
2. Paste the whole task file as the prompt.
3. Let it implement, then run `pnpm turbo run build`.
4. Review the diff against the task's **Acceptance criteria** and **Verification commands**.
5. If the model asks a question, answer using the trade-offs it proposes (Clarification Protocol).

## Deferred (not in this batch — tracked in `EXECUTION_PLAN.md`)
- Auth flow endpoints (`/auth/login|callback|event-join|logout`) + `event_codes` table (FR-01/FR-03).
- Apache AGE graph adapter + Cypher mirroring.
- SSE notifications to the PWA.
- Replacing `tx?: any` with a real transaction type (type-safety debt).
- Python workers (Phase 2, incl. MILESTONE-2.7 Consolidator) and the SvelteKit PWA (Phase 3).
- CI/CD, tests and k6 (Phase 4).
