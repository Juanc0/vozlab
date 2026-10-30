# ADR-0044: Identity vocabulary coherence and migration baseline collapse

- Status: Accepted
- Date: 2026-10-30
- Related: ADR-0042 (cross-tenant identity — the half-renamed tables), ADR-0028
  (the original global index), ADR-0003 (Drizzle schema is the source of truth),
  source design record: `docs/analysis/db-identity-normalization.md` (DEC-1,
  DEC-2, DEC-6, DEC-7, DEC-8), executed by `docs/plans/db-baseline/v1.md`
  (commits `90fc8b2`, `552b6e0`, `b461fc3`, `03adb33`, `ba3514b`).
- Supersedes: **nothing**. The renames complete what the pre-baseline router
  migration `0009` started (the fold file is gone; its history is in git).

## Context

The v5/v6 identity intervention left the storage half-renamed. Migration
`0009` renamed `global_identities` to `global_users`, but nothing followed:
the satellite tables, their columns, indexes, ports, types and script comments
kept the `global_identity_*` vocabulary while the parent table spoke
`global_users` — two names for one concept, in the schema and in the code.
The same table also carried a comment claiming "Contains NO PII", false since
v5 stored `email`, `full_name` and the raw `subject`.

Migration history had rotted in the same way: 28 accumulated folds (10 router
+ 18 tenant) whose journals had already produced an outage when a hand-written
fold was never journaled (committee B13), per-DB snapshot files that made
`db:generate` append silently after a partial delete, and a dev volume lagging
the folds so `test:integration` was red locally while CI's fresh migrate was
green — the same bug investigated twice. The dev cluster also carried orphans
from executed one-shot folds: a `vozlab` database nothing connected to, a
`vozlab_graph` AGE schema created by init SQL although the AGE adapter does
not exist (ADR-0004), and two backfill scripts whose folds were gone.

## Decision

1. **One vocabulary, applied everywhere** — schema, TS internals, script
   comments and doc prose, per this map (the design record's audit table):

   | Object | Old | New |
   | --- | --- | --- |
   | router table | `global_identity_tenants` (col `global_identity_id`, index `uniq_global_identity_tenant`) | `global_user_tenants` (col `global_user_id`, index `uniq_global_user_tenant`) |
   | router table | `global_identity_events` (col `global_identity_id`, indexes `idx_global_identity_events_*`) | `global_user_events` (col `global_user_id`, indexes `idx_global_user_events_{identity,tenant,created}`) |
   | router index inside `global_users` | `uniq_global_identities_issuer_subject` | `uniq_global_users_issuer_subject` |
   | tenant `auth.users` | col `global_identity_id` (+ `uniq_users_global_identity`) | `global_user_id` (+ `uniq_users_global_user`) |
   | TS ports/types/files | `IGlobalIdentityEventRepository`, `GlobalIdentityTenant`, `GlobalIdentityEvent`, `findGlobalTenantLink`/`linkGlobalTenant`, param `globalIdentityId` | `IGlobalUserEventRepository` (file renamed too), `GlobalUserTenant`, `GlobalUserEvent`, `findGlobalUserTenantLink`/`linkGlobalUserTenant`, `globalUserId` |
   | `global_users` comment | "Contains NO PII (no email, name, role). Only the IdP subject hash" | the v5/v6 truth: PII present by decision (email, full_name, picture, raw subject) — pseudonymisation is a future plan, not today |

2. **Wire contracts are frozen.** The HTTP field stays `globalUserId` (it
   already matched) and the persisted audit discriminator VALUE
   `'global_identity'` (the `targetType` routing key in `IAuditLog`) is NOT
   renamed — rows already written would stop matching. Identifiers change;
   bytes on the wire and stored discriminator values do not (DEC-8).

3. **Collapse the 28 folds to one baseline per DB.** Delete every
   `migrations/{router,tenant}/*.sql`, `meta/_journal.json` **and the
   `meta/*_snapshot.json` files**, then regenerate with `db:generate:router` /
   `db:generate:tenant`. Snapshot deletion is part of the procedure: with
   stale snapshots, `db:generate` appends to the deleted history instead of
   baselining. The old folds are not migrated forward — their content is the
   baseline; their history is git.

4. **Purge the dev-cluster orphans from the definitions.** `02-extensions-and
   -graph.sql` keeps the extension creation and drops `SELECT create_graph(...)`
   — the AGE graph will be created on demand when the adapter lands (ADR-0004);
   `POSTGRES_DB`/`-d vozlab` leave both composes (healthchecks point at the
   `postgres` maintenance DB); the two executed `backfill-*.ts` scripts and
   their `db:backfill:*` keys are deleted.

5. **Reset the dev volume**, `pg_dump` backups of both DBs taken first (into
   the gitignored `local-backups/`). The controller ruling: only the postgres
   volume was destroyed — the plan's blanket `compose down -v` would have
   deleted the Ollama model weights.

## Consequences

### Positive

- One concept, one name: a reader of `global_user_events` finds a `global_user_
  id` column and an `IGlobalUserEventRepository` port; grep by any of them
  finds everything.
- `test:integration` runs green on the local cluster exactly as it does in
  CI (38/38 after the reset) — the dev-volume drift class is closed and its
  invariant is recorded in `.opencode/agents/database-dba.md`.
- A new DB (dev or prod) migrates in one fold per database; the journal can
  no longer drift against a hand-written fold.
- The schema comments state the real PII posture, so the security baseline
  and the privacy work (F4) start from the truth.

### Negative / costs

- **Old volumes and journals are incompatible by design.** Any database
  carrying the pre-collapse folds cannot `db:migrate` onto the new baseline;
  it must be rebuilt (fresh DB + baseline + seed) or restored from a pre-reset
  dump. There is no forward migration path — accepted because every affected
  database was dev-local.
- Dated historical records (committee review §B13, the design record's audit
  table, ADR-0028/0042 bodies, archived task trees) keep speaking the old
  names — history is allowed to speak the old vocabulary; they carry a
  pointer to this ADR instead of a rewrite.
- CI's integration service (`pgvector/pgvector:pg18`) still lacks `age` while
  the dev image has it; harmless because no fold creates a graph anymore —
  parity of capability noted in DEC-8, not chased.

## Links

- `docs/analysis/db-identity-normalization.md` — the audit and the DEC record
- `docs/plans/db-baseline/v1.md` — the executed plan (T5 = this record)
- `docs/decisions/ADR-0042-cross-tenant-identity-and-explicit-tenant.md`
- `docs/decisions/ADR-0028-multi-institution-identity-global-index-and-broker.md`
- `.opencode/agents/database-dba.md` — the reset invariant and the journaling rule
