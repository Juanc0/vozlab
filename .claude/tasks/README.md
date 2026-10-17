# VozLab — Atomic Task Prompts

Self-contained prompts for independent, low-context models. Each file embeds the context,
constraints and acceptance criteria needed to execute it **without reading the rest of the repo**
(beyond the files it names). The executor must run `pnpm turbo run build` and then mark the task
`[x]` in `TODO.md`.

> Governing docs: `EXECUTION_PLAN.md` and `TODO.md`.
> Batches: **Phase 1R** (remediation + vertical propagation, TASK-01…17 — done),
> **Phase 1S** (consolidation, identity & dev readiness, TASK-18…31 — done) and
> **Phase 1T** (dev ergonomics, layering & ingestion contract, TASK-32…45 — current).

## Phase 1R — execution order (TASK-01…17)

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

## Phase 1S — execution order (TASK-18…31)

> Full rationale, findings (H/M/L) and the 10 answered concerns: see
> `.claude/reviews/REVIEW-2026-10-17_phase-1r.md`.

| # | Task file | Group | Depends on |
| --- | --- | --- | --- |
| 18 | `TASK-18_api-dev-boot-and-env-example.md` | 1S.1 Bootstrap | — |
| 19 | `TASK-19_dev-identity-bootstrap.md` | 1S.2 Identity | 17, 18 |
| 20 | `TASK-20_author-hash-hardening.md` | 1S.2 Identity | 18 |
| 21 | `TASK-21_system-agent-identity-contract.md` | 1S.2 Identity | 19, 20 |
| 22 | `TASK-22_cross-workspace-isolation.md` | 1S.1 Correctness | — |
| 23 | `TASK-23_proposal-read-endpoints.md` | 1S.1 Correctness | 22, 24 |
| 24 | `TASK-24_keyset-and-softdelete-deduplication.md` | 1S.1 Correctness | — |
| 25 | `TASK-25_soft-delete-policy.md` | 1S.3 Policy | 22, 24 |
| 26 | `TASK-26_rate-limit-per-actor.md` | 1S.3 Policy | 20 |
| 27 | `TASK-27_vote-semantics-alignment.md` | 1S.3 Policy | 20 |
| 28 | `TASK-28_typed-enums-at-boundaries.md` | 1S.3 Policy | 21 |
| 29 | `TASK-29_subgraph-bounding-and-age-decision.md` | 1S.3 Policy | 02 |
| 30 | `TASK-30_infra-error-mapping-and-shutdown.md` | 1S.1 Correctness | — |
| 31 | `TASK-31_vitest-domain-baseline.md` | 1S.4 Quality | 24, 27 |

**Suggested waves (Phase 1S):**
`18 → (19, 22, 23, 24, 30) → (20, 25, 26) → (21, 27, 28, 29) → 31`.
TASK-18 unblocks booting the API; TASK-19 unblocks every manual/E2E check; TASK-24 (`keyset.ts`)
unblocks TASK-23.

## Phase 1T — execution order (TASK-32…45)

> Full rationale, findings (H/M/L), the answered concerns and flag responses: see
> `.claude/reviews/REVIEW-2026-10-17_phase-1s.md`.

| # | Task file | Group | Depends on |
| --- | --- | --- | --- |
| 32 | `TASK-32_dev-env-loading.md` | 1T.1 Correctness | — |
| 33 | `TASK-33_proposal-target-validation.md` | 1T.1 Correctness | — |
| 34 | `TASK-34_request-context-error-consistency.md` | 1T.1 Correctness | 33 |
| 35 | `TASK-35_proposal-authorization-workspace-scoping.md` | 1T.1 Correctness | 33 |
| 36 | `TASK-36_tenant-db-config-contract.md` | 1T.1 Correctness | — |
| 37 | `TASK-37_author-hash-salt-hardening-and-rotation.md` | 1T.2 Identity | — |
| 38 | `TASK-38_timestamp-ownership.md` | 1T.3 Layering | — |
| 39 | `TASK-39_port-naming-convention.md` | 1T.3 Layering | 38 |
| 40 | `TASK-40_domain-placeholder-and-type-dedup.md` | 1T.3 Layering | 39 |
| 41 | `TASK-41_datasource-workspace-mapping-decision.md` | 1T.4 Ingestion | — |
| 42 | `TASK-42_extractor-doc-drift.md` | 1T.4 Ingestion | 41 |
| 43 | `TASK-43_typed-transaction-handle.md` | 1T.5 Quality | 39 |
| 44 | `TASK-44_use-case-test-baseline.md` | 1T.5 Quality | 38, 43 |
| 45 | `TASK-45_test-task-wiring.md` | 1T.5 Quality | 44 |

**Suggested waves (Phase 1T):**
`(32, 33, 36, 41) → (34, 35, 37, 38) → (39, 42) → (40, 43) → (44, 45)`.
TASK-32 makes the documented `.env` workflow boot; TASK-38/39 must precede TASK-43/44 so the
transaction typing and tests start from the final port names.

**Suggested first wave (Phase 1R, done):** TASK-01 → TASK-02, TASK-03, TASK-06, TASK-07 →
TASK-04, TASK-05 → TASK-08 → TASK-09 → TASK-10/11/12/13/14/15 → TASK-16, TASK-17.

## How to use one file
1. Start a fresh session (fresh context) with the target model.
2. Paste the whole task file as the prompt.
3. Let it implement, then run `pnpm turbo run build`.
4. Review the diff against the task's **Acceptance criteria** and **Verification commands**.
5. If the model asks a question, answer using the trade-offs it proposes (Clarification Protocol).

## Deferred (not in this batch — tracked in `EXECUTION_PLAN.md`)
- Auth flow endpoints (`/auth/login|callback|event-join|logout`) + `event_codes` table (FR-01/FR-03).
  Phase 1S ships **dev-only** token minting (TASK-19) instead.
- **Per-tenant, versioned author-hash salt** (router DB `tenants.author_hash_salt` /
  `tenant_secrets` + `hash_version` + dual-read/backfill). TASK-37 does the production guard and
  model; the storage/rotation milestone triggers on the first two-institution deployment.
- **Data-source registry** (`meta.data_sources` + a resolution route) and the worker behavior
  profiles. TASK-41 freezes the contract; the table/routes belong to Phase 2 (Extractor).
- Apache AGE graph adapter + Cypher mirroring. Phase 1S keeps the bounded SQL CTE and records the
  decision (TASK-29).
- Redis-buffered CQRS vote scoring (`modules_01 §5`). Phase 1S keeps the synchronous DB increment
  and records the decision (TASK-27).
- GraphQL facade (not in the spec; REST + Zod + `X-Workspace-ID` is mandated).
- SSE notifications to the PWA.
- `edit_proposals.target_id` FK + `ontology_classes (workspace_id, system_key)` unique (`M-12`).
- Python workers (Phase 2, incl. MILESTONE-2.7 Consolidator) and the SvelteKit PWA (Phase 3).
- CI/CD, integration/E2E tests, coverage and k6 (Phase 4). TASK-31/TASK-44 seed the Vitest
  baseline; integration tests are skipped in this environment (no Docker).
