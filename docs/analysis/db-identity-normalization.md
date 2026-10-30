# DB identity normalization — design & decision record

> **Plan 1 EXECUTED 2026-10-30** — the renames, baseline collapse, orphan
> purge and dev-volume reset landed (`90fc8b2`, `552b6e0`, `b461fc3`,
> `03adb33`, `ba3514b`); the decision is recorded in
> [ADR-0044](../decisions/ADR-0044-identity-vocabulary-coherence-and-migration-baseline.md).
> The audit table below keeps the old names on purpose — it IS the old→new
> map. **Plan 2 (`identity-consolidation` v1) OPENED 2026-10-30**
> ([../plans/identity-consolidation/v1.md](../plans/identity-consolidation/v1.md))
> executing DEC-3/4/5 merged with the findings of
> [db-auth-router-flows-audit.md](db-auth-router-flows-audit.md); **DEC-9**
> (invitations: tenant authority + generic router `credential_routes`) was
> adopted by the user the same day. This record archives when its plans
> close.
> Opened: 2026-10-30. Record of an active intervention (same class as
> `auth-onboarding-committee-review.md`). Design gate passed 2026-10-30: every
> DEC below is **approved** — DEC-1/2/3
> by the user's structured choices, DEC-4/5 by the P-1…P-5 answers, DEC-6/7
> with them, DEC-8 recorded as builder calls. Approved ones graduate to ADRs
> inside the plans that execute them. Builder check run by the architect
> subagent the same day; its corrections are integrated in place.

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
| D4 | `users.provider_user_id` vs table `external_identities` | the "kept for backward compatibility" clause is the **schema comment** in `tenant.auth.schema.ts:102-103`; ADR-0028 itself only declares `external_identities` the per-tenant source of (issuer, subject). `DrizzleUserRepository` still carries **two upsert paths**, one per mechanism |
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
replaced by one generated fold each (journal restarted from entry 0). Correct
procedure (drizzle-kit 0.31 semantics, per the builder check): delete the old
folds, the `meta/_journal.json` **and the `meta/*_snapshot.json` files** (the
snapshots are the diff base — leaving them makes `generate` append `0010/0018`
instead of emitting a baseline), then run
`pnpm --filter @vozlab/database db:generate:{router|tenant}`. The generated
file is `0000_<random-slug>.sql`; either keep the slug or rename file **and**
journal `tag` together (migrate matches on tag). Any existing database with
the old `drizzle.__drizzle_migrations` history is incompatible by design —
which is fine because DEC-2 wipes it. Post-plan-1 folds accumulate normally.

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
  tenant transaction (capacity atomicity *relocates* — it is not inherited:
  the tenant path needs the conditional-UPDATE implementation, see below) →
  create the
  `ANONYMOUS_EVENT` user + GUEST membership + rotating session (unchanged).
- Credential separation (user answered P-3, 2026-10-30): `workspace_join_codes`
  gains `purpose varchar(12) NOT NULL` — `'WORKSPACE'` (default; redeemable
  only by the authenticated `RequestWorkspaceAccessUseCase` path) or `'EVENT'`
  (redeemable only by the anonymous QR join path, `auto_approve=true`). The
  two flows each guard their purpose, so unifying the table does not let a
  QR code grant an authenticated MEMBER membership (the leak the builder
  check flagged). One mechanism, two credential classes.
- The **QR stays opaque** (raw code only): ADR-0019's opacity decision stands;
  its *responsibility* exception is what the amendment retires. A new ADR
  amends ADR-0019 and the ADR-0002 amendment text — and must also fix
  ADR-0019's existing stale claim that the join inserts role `MEMBER`
  (`JoinEventUseCase:98` creates `GUEST`; CI's fresh fold blessed that on
  2026-10-30).
- `db:event-code` CLI keeps its UX but writes both sides: **tenant row first,
  then router route** — a transaction cannot span the two physical DBs
  (ADR-0002), so it is sequencing + idempotent upsert on `code_hash`, with
  revocation deleting route-first. A missing route = 404 the CLI can re-push;
  a stale route = harmless (routing is not authority).
- The tenant-side consume must be implemented as the atomic
  `UPDATE … WHERE hash matches AND not revoked AND not expired AND used_count
  < max_uses RETURNING` (the builder check confirmed today's
  `DrizzleWorkspaceJoinCodeRepository` does a JS check + unguarded
  `WHERE id` increment — the atomicity currently lives only in the router;
  it is relocated *and* newly built, not inherited).
- Builder's call (DEC-8 family): `workspace_join_codes.created_by` is a
  nullable UUID but `event_codes.created_by_hash` is the ADR-0013 pseudonym —
  unify the column to `created_by_hash varchar(64)` (matches pseudonym
  semantics; no hash→uuid resolution dance).

### DEC-4 — Email: hashed EVERYWHERE with a pepper; no cleartext in any table (user: chose, P-1+P-2 answered 2026-10-30)

The router vault (`global_users`) does NOT keep cleartext either:
`email` becomes `email_hash` there too. Consequences accepted: nothing in
the platform can ever display or contact by email from the DB; account
linking (cross-IdP JIT and invitation redemption) compares hashes of the
verified email the IdP just delivered — equality over hash is sufficient.
`full_name`/`picture` (profile, not credentials) stay as they are.

All email-derived hashes become `HMAC-SHA-256(lower(trim(email)),
EMAIL_PEPPER)` — a zod-validated env secret (new required var; dev default
in `.env.example`). Plain unsalted SHA-256 over an email is enumerable from
a dump via public email lists; the pepper removes that while keeping
search-by-comparison. High-entropy random tokens (refresh tokens, event/join
code tokens, invitation tokens) KEEP plain SHA-256 (`hashOpaqueToken`) —
they are not dictionary-attackable and a pepper there would buy nothing.

Applies in Plan 2 to: `global_users.email→email_hash`, `global_invitations`
(drop `email`, add `email_hash`), tenant `invitations` (drop `email`, keep
`email_hash` — now peppered), `users.email` (dropped entirely by DEC-5/T4),
and every use case that hashes or compares an email.

### DEC-5 — One mechanism per remaining concept (Plan 2 folds)

- D3 (user's formulation, 2026-10-30): the `workspaces` table manages **no**
  credential. Drop `workspaces.join_code` (static, plaintext, cannot expire
  or revoke) **and** `workspaces.auto_approve_join_code` (P-5: written,
  seeded, exposed in the admin DTO, read by no behavior → dropped).
  `workspace_join_codes` is the sole credential manager:
  `CreateWorkspaceUseCase` inserts the default row in the same transaction;
  `RotateJoinCodeUseCase` rotates that row; the raw code is revealed only in
  the create/rotate response — the admin UI's code display becomes
  reveal-on-rotation (one small web task, the only web change of the
  intervention).
- D4: drop `users.provider_user_id` + `uniq_users_provider_provider_user`;
  `external_identities` is the sole external-identity store (the "kept for
  backward compatibility" clause is the schema comment, retired here;
  ADR-0028's direction completed); the second upsert path in
  `DrizzleUserRepository` is deleted.
- D5: with DEC-4 + D4, `users.email` is **dropped** — the tenant knows
  `author_hash` + pseudonym only; no email (clear or hashed) persists per
  tenant. Linking by verified email moves to `email_hash` equality in the
  router vault, before the tenant row exists.

### DEC-6 — Naming coherence sweep (Plan 1, mechanical)

All of the §Audit table above: tables, columns, indexes, TS ports/types/params,
raw-SQL test fixtures, `docs/requirements.md` matrix rows, `docs/conventions.md`
naming section. `external_identities` KEEPS its name — it legitimately maps
external IdP identities inside the tenant (it was never about `global_users`).

### DEC-7 — Orphan deletion (Plan 1)

`vozlab_graph` creation out of the init SQL (extension stays); `POSTGRES_DB`
out of compose **in both files** (`docker-compose.yml` env+healthcheck and
`docker-compose.prod.yml` healthcheck use `-d vozlab` — dropping the DB
without editing the prod healthcheck would leave the service unhealthy);
the two `backfill-*` scripts deleted **with their `db:backfill:*` entries
in `packages/database/package.json`**.

### DEC-8 — Builder decisions taken during the check (2026-10-30, architect subagent)

Recorded as mine, not the user's:

- The Plan-1 sweep renames **internals to the wire contract**, not the wire
  to internals: the HTTP surface already says `globalUserId`
  (`AuthController`, `web/api/admin.ts`); only the persisted audit
  discriminator strings stay untouched (zero web surface preserved).
- Fixture comments citing "tenant migration 0013" (neighbors/auth tests)
  become "the baseline" after DEC-1.
- "Local equals CI" is folds+data parity only — CI provisions plain
  `pgvector/pgvector:pg18` without the `age` extension while the compose
  image has it; that asymmetry is noted, not chased.

### DEC-9 — Invitations: tenant authority + generic router directory (user, 2026-10-30)

Adopted after the flows audit's alternatives review
([db-auth-router-flows-audit.md](db-auth-router-flows-audit.md) §8.5/§9.1):
the DEC-3 pattern generalizes to **all** pre-tenant credentials. The router
keeps one directory `credential_routes(credential_hash UNIQUE, kind
'EVENT'|'INVITATION', tenant_id, created_at)` — routing, never authority —
while `global_invitations` is **retired** and every invitation (same-org or
external) becomes a tenant `invitations` row with the strict profile already
proven there (72 h TTL, single-use, revoke-on-resend, atomic accept).
Workspace/role assignment therefore lives ONLY in the tenant row (the audit
answer to "can it be delegated? — it should be"). Sequencing invariant: mint
writes tenant authority first, route second; revoke deletes route first,
then revokes the authority; a stale route is inert, a missing route
re-pushes. Consequence accepted: the lax global twin's caller-set expiry +
unlimited default uses disappear, and the "no REVOKED/EXPIRED writers on
global_invitations" gap disappears WITH the table.

## Plan shape

**Plan 1 — `db-baseline`** (renames + collapse + reset + orphans; every task
gate-green):
schema files rename → **delete old folds + journals + `meta/*_snapshot.json`
first** (the snapshots are the diff base; generating with them present
appends instead of baselining, DEC-1) → `db:generate:{router|tenant}` yields
the single baseline fold each → init SQL + both composes cleanup → script +
package.json deletions → TS rename sweep (ports, adapters, use-case params,
fixtures; wire names untouched, DEC-8) → `pg_dump` backup of the dev volume →
volume reset (`compose down -v` + `up -d --build` + migrate both + seed) →
`test:integration` **locally** green — the drift class disappears, local
equals CI for the first time → docs updates (requirements matrix, conventions,
this record) → ADR: "identity naming coherence + migration baseline collapse."

**Plan 2 — `identity-consolidation`** (each item its own fold + code + tests):
T1 email-hash policy: `EMAIL_PEPPER` env + HMAC helper + peppered hashes in
`global_invitations`/`invitations` and JIT linking (DEC-4) · T2 `users.email`
dropped (tenant never stores email, clear or hashed) and `global_users.email`
→ `email_hash` — vault decision (DEC-5 D5, P-1 answered) · T3 drop
`workspaces.join_code` + `workspaces.auto_approve_join_code`; default row in
`workspace_join_codes`; reveal-on-rotation web task (DEC-5 D3, P-4/P-5) ·
T4 drop `users.provider_user_id`; one upsert path (DEC-5 D4) · T5
`event_code_routes` + `purpose` column + atomic tenant-side redemption +
`JoinEventUseCase` re-orchestration; ADR amending 0019/0002 and fixing the
MEMBER→GUEST stale text (DEC-3) · each: requirements-matrix + component docs
updated with the task.

> The OPENED plan superseded this sketch: 9 tasks with T5/T6 split per DEC-9
> — the authoritative task text is
> [../plans/identity-consolidation/v1.md](../plans/identity-consolidation/v1.md).

## Open items — all answered by the user (2026-10-30)

P-1 hashed vault · P-2 pepper on email-derived hashes only · P-3 `purpose`
column separates EVENT/WORKSPACE credentials · P-4 table manages the codes,
reveal-on-rotation accepted (user's own formulation) · P-5 dead flag dropped.
Nothing remains that changes what gets built; the builder-check's minor gaps
became DEC-8.

## Out of scope

- Consolidator handler, ingestion producer, AGE adapter, SSE (ROADMAP).
- Production go-live (B11 hostname) and external IdP credentials (B9).
- Web changes beyond the one P-4 forces (admin DTO + copy). The PWA reads the
  API, not the DBs; the Plan-1 rename sweep has zero web surface (verified:
  web has no SQL, and per DEC-8 internals move toward the wire names, not
  the reverse).
