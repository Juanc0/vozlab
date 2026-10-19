# Review — Phase 1T close-out (TASK-31 → TASK-45)

- Date: 2026-10-19
- Scope: TASK-31…TASK-45 (Phase 1S.4 quality + Phase 1T), cross-task consistency,
  and the close-out batch that followed the review.
- Method: read every task file and its claimed result, verify acceptance criteria
  in code, run the gates, then fix the findings found by verification.

## Verdict

All 15 tasks **verified**. Batch approved.

| Gate | Result at review time | Result after close-out |
| --- | --- | --- |
| `pnpm test` | 15 files / 60 tests, exit 0 | 15 files / 60 tests, exit 0 |
| `pnpm turbo run build` | 3/3 | 3/3 |
| `pnpm type-check` (new) | n/a — tests/scripts not checked | 5/5 (build + tests/scripts) |
| Turbo warning for `api#test` | gone (TASK-45) | gone |

Notable per-task evidence: workspace-scoped resolution (TASK-35) returns 404 for
foreign/soft-deleted targets; the pool contract (TASK-36) distinguishes `null`
from infrastructure failures; timestamps (TASK-38) are domain-owned with the
adapter writing `deleted_at`; `DbTransaction` (TASK-43) is opaque and the domain
has no Drizzle/pg import.

## Findings raised by the review

| ID | Finding | Resolution |
| --- | --- | --- |
| B1 | `DrizzleNodeRepository.applyDelta` could mutate a soft-deleted node (auto-apply path). | Fixed: `deleted_at IS NULL` added to the target lookup. |
| L-13 | `CastVoteUseCase` called `resolveAuthorHash(hash, hash)` — a no-op that read like derivation. | Fixed: `AuthorHash.fromString`. |
| M-12 | No uniqueness on `meta.ontology_classes(workspace_id, system_key)`; polymorphic `edit_proposals.target_id` has no FK. | Unique index added (migration `0002`); polymorphic targets remain validated at creation and are documented in `domain-model.md`. |
| — | Type-check blind spot: `tests/**` and `packages/database/scripts/**` were never compiled. | Fixed: `tsconfig.tests.json`, `tsconfig.scripts.json`, `pnpm type-check`. Incomplete test fakes were completed as a result. |
| — | `pnpm lint` red (pre-existing `no-explicit-any`, 26 errors). | Recorded as debt in ADR-0017 / ROADMAP 4.7; not added to CI. |
| — | Docs drift (cookie auth, salt, PG16/drizzle 0.34, "routes not wired", old stream names). | Superseded by the documentation restructure; v1 tree frozen under `docs/archive/spec-v1/`. |

## Design change made in the close-out

**Pseudonymity:** the salted-hash model was replaced by a random, opaque,
per-user `author_hash` stored on `auth.users` and carried verbatim as the JWT
`authorHash` claim. The salt (`AUTHOR_HASH_SALT`), the derivation service and the
per-tenant salt milestone were removed. Rationale and trade-offs:
`docs/decisions/ADR-0013-random-opaque-pseudonym.md`.

## Documentation restructure

- Live set: `README.md`, `ROADMAP.md`, `docs/README.md`,
  `docs/{architecture,requirements,domain-model,auth-and-tenancy,conventions,api-reference,errors,runbook-dev,runbook-ops,testing}.md`,
  `docs/decisions/` (17 ADRs), `docs/spec/` (5 phase-2/3 specs).
- Frozen: `docs/archive/{spec-v1,tasks,reviews,history,prompts}/`.
- `TODO.md` and `EXECUTION_PLAN.md` retired in favour of `ROADMAP.md`.

## Residual risk / next

1. Embedding computation (FR-18) has no milestone in the old plan — added to
   Phase 2 in the roadmap and called out in `docs/README.md`.
2. Auth endpoints (FR-01/02/03) remain unbuilt; dev minting is the interim.
3. Integration tests, metrics/tracing and lint debt are Phase 4 items.
4. No commit was made as part of the review; the close-out changes are the
   working tree of this batch.
