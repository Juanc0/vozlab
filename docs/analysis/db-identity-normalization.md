# DB identity normalization — design & decision record

> Opened: 2026-10-30. Record of an active intervention (same class as
> `auth-onboarding-committee-review.md`). It archives when its plans close.
> Decisions here are PROPOSED until the user approves this document; approved
> ones graduate to ADRs before any code moves.

## Intent

Three fronts the user asked for:

1. Audit the identity/tenancy storage at the level of tables, columns, names
   and per-layer responsibility; rename for coherence; delete orphans; and
   **restart** the databases on a collapsed single-baseline migration set.
2. Consolidate the duplicated mechanisms so each concept has ONE table and each
   layer is responsible for itself (routing / global identity / institutional
   identity / membership), minimizing cross-layer leaks.
3. A complete root README (in flight separately, reflects post-refactor names
   in its DB section when the plans close).

Slicing chosen by the user: **two sequential plans** — Plan 1 (renames +
baseline + reset, mechanical), Plan 2 (responsibility consolidation, semantic,
each item its own green task on top of the new baseline).

## Audit evidence (verified 2026-10-30 against the live dev cluster)

### Stale half-rename (migration 0009 renamed the table, nothing else followed)

| Location (evidence) | Current | Coherent |
|---|---|---|
| router table | `global_identity_tenants`, col `global_identity_id`, index `uniq_global_identity_tenant` | `global_user_tenants` / `global_user_id` / `uniq_global_user_tenant` |
| router table | `global_identity_events`, col `global_identity_id`, indexes `idx_global_identity_events_*` | `global_user_events` family |
| router index inside `global_users` | `uniq_global_identities_issuer_subject` | `uniq_global_users_issuer_subject` |
| tenant `auth.users` | col `global_identity_id` | `global_user_id` |
| port + types (TS) | `IGlobalIdentityEventRepository`, `GlobalIdentityTenant`, `GlobalIdentityEvent`, `RouterDatabaseClient.findGlobalTenantLink/linkGlobalTenant`, `IUserRepository` param `globalIdentityId`, `CompleteOidcLoginUseCase` mixes `globalUserId` and `globalIdentityId` | mirror the table renames |
| schema comment `global_users` | "Contains NO PII (no email, name, role). Only the IdP subject hash" — false twice since v5: the table HAS `email/full_name/picture` and `subject` is stored raw | rewritten to state what v5/v6 actually decided (see Open items §P-1) |
| scripts | `backfill-global-identities.ts`, `backfill-external-identities.ts` — one-shot fold scaffolding | deleted with the baseline |

### Duplicated mechanisms (confirmed live, with row counts)

| # | Duplication | State |
|---|---|---|
| D1 | router `event_codes` (390 rows) vs tenant `workspace_join_codes` (12 rows) | two credential systems with near-identical semantics (hash-lookup, expiry, max_uses/used_count, revoked, auto-approve on the tenant side). `event_codes` additionally keeps `workspace_id` + `created_by_hash` inside the router — the cross-layer leak under discussion |
| D2 | router `global_invitations` (7 rows) vs tenant `invitations` (2 rows) | both live. Router stores `email` **plaintext**; tenant stores `email` **and** `email_hash` — inconsistent PII handling of the same credential |
| D3 | `workspaces.join_code` (column, `RotateJoinCodeUseCase`) vs table `workspace_join_codes` (`JoinCodeController`, `Create/UpdateWorkspaceJoinCodeUseCase`, `RequestWorkspaceAccessUseCase`) | two join-code mechanisms per workspace |
| D4 | `users.provider_user_id` vs table `external_identities` | ADR-0028 says the table wins and the column is "backward compatibility"; `DrizzleUserRepository` still carries **two upsert paths**, one per mechanism |
| D5 | `users.email` vs `global_users.email` | v5 declared router the single source of "who is this user"; tenant JIT still writes/reads `users.email` (used to link accounts across IdPs by verified email). It is a functional cache, undocumented as such |

### Orphans / debris

| Item | Evidence | Verdict |
|---|---|---|
| schema `vozlab_graph` in `vozlab_tenant_dev` with labels `Node`, `RELATED_TO`, `MERGED_INTO`, `CAUSES` | created by `packages/database/scripts/02-extensions-and-graph.sql`; the AGE adapter is **not built** (AGENTS state list); graph storage is relational `public.nodes/edges`; nothing reads the AGE graph | removed from init SQL in Plan 1; the `age` extension stays enabled so the future adapter creates its graph on demand |
| database `vozlab` — empty (0 tables) | compose `POSTGRES_DB=vozlab` auto-creates it; no connection string uses it | `POSTGRES_DB` removed from compose in Plan 1 |
| `backfill-global-identities.ts`, `backfill-external-identities.ts` | executed folds 0009 / 0017 era; obsolete after collapse | deleted in Plan 1 |
| `reconcile-router-tenants.ts` | dev utility for router drift | kept (not fold-coupled) |
| `tenant_identity_providers` — 0 rows | NOT orphan: routes + controller + port exist (D1 IdP federation). Unseeded, not dead | kept; seed optionally in Plan 1 |

## Decisions (proposed)

### DEC-1 — Migration collapse to a single baseline per database (user: yes)

Pre-production (T2 not deployed, dev volume declared disposable), so history
lives in git, not in the folds. `packages/database/migrations/{router,tenant}/`
replaced by one generated `0000_baseline.sql` each (journal restarted from
entry 0), produced from the renamed schema files via
`pnpm --filter @vozlab/database db:generate:{router|tenant}` after deleting the
old folds + journals. Any existing database with the old `drizzle.__drizzle_migrations`
history is incompatible by design — which is fine because DEC-2 wipes it.
Post-plan-1 folds accumulate normally.

### DEC-2 — Database restart (user: yes)

Drop volume → fresh compose (init scripts create `vozlab_router` +
`vozlab_tenant_dev`, extensions, NO `vozlab` DB, NO AGE graph) → `db:migrate`
both → `db:seed:dev` → verify. Side benefit already diagnosed: the known
"dev-volume data drift" (stale `general`-as-EVENT, 403 agent memberships that
make local `test:integration` red while CI's fresh fold is the authority)
disappears — the local volume finally equals what CI provisions.

### DEC-3 — `event_codes` → thin router routing + one join-code mechanism (user: chose)

Layer model used as the criterion:

- **L0 routing** (router): "which institution?" — pure mappings
  (`oidc_tenant_id→tenant`, `code_hash→tenant`, `invitation_token→tenant`).
- **L1 global identity** (router): `global_users`, `global_user_tenants`,
  `global_user_events`.
- **L2 institutional identity** (tenant): `users`, `external_identities`.
- **L3 membership** (tenant): `workspace_memberships`, join requests, join
  codes, invitations redemption.

Plan 2 moves the full event-code credential into the tenant and keeps only a
routing index in the router:

- New router table `event_code_routes(code_hash UNIQUE, tenant_id FK, created_at)`
  — a directory, the same kind of row `tenants.oidc_tenant_id` already is.
  No capacity, no workspace, no creator, no expiry authority.
- The credential itself becomes a `workspace_join_codes` row on the tenant
  side for the EVENT workspace (`auto_approve=true`, `max_uses`, `expires_at`,
  `revoked_at` already exist there — D1 collapses into one mechanism).
- `JoinEventUseCase` re-orchestrates: hash → `event_code_routes` → tenant id →
  open tenant → single conditional `UPDATE … RETURNING` redemption inside the
  tenant transaction (capacity stays atomic, just relocated) → create the
  `ANONYMOUS_EVENT` user + GUEST membership + rotating session (unchanged).
- The **QR stays opaque** (raw code only): ADR-0019's opacity decision stands;
  its *responsibility* exception is what the amendment retires. A new ADR
  amends ADR-0019 and the ADR-0002 amendment text.
- `db:event-code` CLI keeps its UX but writes both sides (tenant row + router
  route) transactionally in the CLI, not the API.
- Consistency rule documented: routing rows are deleted when the credential is
  revoked/expired by the CLI/rotation job; a stale route is **harmless** —
  routing is not authority, the tenant rejects the redemption.

### DEC-4 — Email credentials: hash-only, no plaintext in any credential table (user: chose)

Applies to `global_invitations` (drop `email`, add `email_hash`), tenant
`invitations` (drop `email`, keep `email_hash`) and the JIT linking lookup
(compare the verified email's hash). Plan 2.

Builder's call (flagged to user in §Open P-2): plain unsalted SHA-256 of an
email is enumerable (rainbow tables over public email lists). Proposal: the
hash becomes `HMAC-SHA-256(email_lower_trimmed, EMAIL_PEPPER)` with the pepper
a zod-validated env secret, so stored hashes stay searchable-by-comparison
but not enumerable from a DB leak alone.

### DEC-5 — One mechanism per remaining concept (Plan 2 folds)

- D3: drop `workspaces.join_code`; `CreateWorkspaceUseCase` inserts the default
  `workspace_join_codes` row; `RotateJoinCodeUseCase` rotates that row
  (`is_default` flag or label convention — plan decides).
- D4: drop `users.provider_user_id` + `uniq_users_provider_provider_user`;
  `external_identities` is the sole external-identity store (ADR-0028
  completed, its "kept for backward compatibility" clause retired); the second
  upsert path in `DrizzleUserRepository` is deleted.
- D5: after D1–D4, decide `users.email`: since linking uses hashes and the
  router is the declared identity vault, proposal = **drop `users.email`
  entirely** (the tenant knows `author_hash` + pseudonym; email exists only in
  `global_users`), which makes D5's cache issue moot. Pending P-1.

### DEC-6 — Naming coherence sweep (Plan 1, mechanical)

All of the §Audit table above: tables, columns, indexes, TS ports/types/params,
raw-SQL test fixtures, `docs/requirements.md` matrix rows, `docs/conventions.md`
naming section. `external_identities` KEEPS its name — it legitimately maps
external IdP identities inside the tenant (it was never about `global_users`).

### DEC-7 — Orphan deletion (Plan 1)

`vozlab_graph` creation out of the init SQL (extension stays); `POSTGRES_DB`
out of compose; the two `backfill-*` scripts deleted.

## Plan shape

**Plan 1 — `db-baseline`** (renames + collapse + reset + orphans; every task
gate-green):
schema files rename → generate single baselines → delete old folds/journals →
init SQL + compose cleanup → script deletions → TS rename sweep (ports,
adapters, use-case params, fixtures, integration tests) → volume reset →
seed + `db:seed` fixtures green → `test:integration` locally equals CI
(drift gone) → docs updates (requirements matrix, conventions, agent-tooling,
database-dba note about drift now obsolete) → ADR: "migration baseline
collapse + identity naming coherence" (supersedes nothing; amends none).

**Plan 2 — `identity-consolidation`** (each item its own fold + code + tests):
T1 email-hash policy (pepper, DEC-4) · T2 `event_code_routes` + join-code
unification + `JoinEventUseCase` re-orchestration (DEC-3, ADR amending
0019/0002) · T3 drop `workspaces.join_code` (D3) · T4 drop `provider_user_id`
(D4) · T5 drop `users.email` / finalize identity vault (D5, P-1 answer) ·
T6 global_invitations email (D2 tail) · each: requirements-matrix + component
docs updated with the task.

## Open items needing the user

- **P-1**: global `users.email` (identity vault) — cleartext email stays ONLY
  in `global_users.email` in the router (per-tenant DBs never store it;
  DEC-5 T5), or hashed there too (then no component can ever display or
  contact by email; JIT/cross-IdP linking works either way since equality
  over hash suffices). Proposal: cleartext in the vault only.
- **P-2**: peppered HMAC instead of the current unsalted SHA-256 for the
  credential hashes (DEC-4). Proposal: yes.

## Out of scope

- Consolidator handler, ingestion producer, AGE adapter, SSE (ROADMAP).
- Production go-live (B11 hostname) and external IdP credentials (B9).
- Anything web-facing: the PWA reads the API, not the DBs; renames of router
  columns have zero web surface (verified: web has no SQL).
