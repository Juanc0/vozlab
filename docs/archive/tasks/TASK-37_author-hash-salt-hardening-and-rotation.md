# TASK-37 — Author-Hash Salt: Per-Tenant Model, Production Guard & Rotation Runbook

> **Batch:** Phase 1T.2 (Identity & Secrets) · **Depends on:** none · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`author_hash = SHA-256(identity + salt)` is the pseudonymous public identity (NFR-07). TASK-20
introduced `AUTHOR_HASH_SALT` (required, ≥ 16 chars) and made `resolveAuthorHash` the only reader.
Two problems remain:

1. **One salt for every tenant.** It is a single process-wide env var, so every institution served
   by this API instance shares a pseudonym space. The architecture (router DB = tenant registry)
   implies the salt is **per institution**.
2. **Rotation is destructive and undocumented.** The pseudonym is *stored* on rows
   (`auth.users.author_hash`, `public.nodes.author_hash`, …) and *compared* for authorization
   (maintainer approve/reject, FR-12) and for the `unique_user_target_vote` constraint (FR-14/15).
   Changing the salt today changes every derived caller hash → approve/reject immediately fails and
   votes can double-count. There is no `hash_version`/`salt_id`, no dual-read, no backfill.
   Also, nothing stops shipping the `.env.example` dev value to production.

## 2. Objective
Do the *safe, small* part now and record the big part as a tracked milestone:
(a) **per-tenant-ready abstraction** so the salt is not read ad-hoc; (b) **production guard** against
the placeholder salt; (c) **rotation model + runbook** documented; (d) per-tenant salt storage and
versioned re-keying explicitly deferred with a trigger condition.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Secrets come from `env.ts`, never hardcoded; never log the salt.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/application/services/resolveAuthorHash.ts` |
| Edit | `apps/api/src/shared/config/env.ts` |
| Edit | `.env.example` |
| Edit | `docs/system/system_04_authentication_and_multitenancy.md` (§3.1) |
| Edit | `docs/modules/modules_02_backend_fastify_guide.md` (a short "Author hash & salt" subsection) |
| Edit | `EXECUTION_PLAN.md` → Deferred (the per-tenant/versioned milestone) |

## 5. Step-by-step instructions
1. **Production guard.** In `env.ts`, add a Zod refinement (or a check in `loadEnv`) that rejects
   the known placeholder/example value **when `NODE_ENV === 'production'`**:
   e.g. `AUTHOR_HASH_SALT` must not equal `dev-institutional-salt-change-me` and must be ≥ 32 chars
   in production (keep ≥ 16 elsewhere). Fail with a clear message and `process.exit(1)` via the
   existing path.
2. **Single, tenant-aware seam.** Keep `resolveAuthorHash(raw, subject)` as the API but give it an
   explicit tenant parameter **defaulting to the current global salt**, so a later per-tenant change
   is a one-line provider swap and no call site moves:
   ```ts
   export function resolveAuthorHash(raw: string | undefined, subject: string, tenantId?: string): AuthorHash
   ```
   Default implementation reads `env.AUTHOR_HASH_SALT`; add a doc-comment that a future
   `SaltProvider` will resolve `tenantId → salt` from the router DB. Do **not** change call sites in
   this task (the extra argument is optional).
3. **Document the rotation model** in `system_04 §3.1`:
   - the salt is per **institution**, not per user/workspace;
   - the pseudonym is stored, so rotation is a **data migration**, not a config change;
   - the required future shape: `hash_version`/`salt_id` on `users` and the graph tables, dual-read
     during a window, then backfill;
   - until then, **do not rotate** `AUTHOR_HASH_SALT` on a populated database.
4. **Track the deferred milestone** in `EXECUTION_PLAN.md` → Deferred:
   *Per-tenant, versioned author-hash salt: store the salt per tenant in the router DB
   (`tenants.author_hash_salt` or `tenant_secrets`), add `hash_version`, implement dual-read +
   backfill. Trigger: the first deployment that serves two institutions from one API instance.*
   Do **not** implement the table/versioning in this task.
5. `.env.example`: annotate the salt line with the production rule and a "rotation = migration"
   warning.

## 6. Constraints & gotchas
- Do **not** add a router-DB column or migration here; that is the deferred milestone.
- Do **not** re-hash a token that carries a valid 64-hex `authorHash` (TASK-20/19 depend on it).
- Do **not** break `db:seed:dev` / `db:mint-token`, which use `sha256('dev-<name>')` **without** the
  salt — those values are preserved verbatim by the resolver, so this task must not add salt to them.
- Keep the failure mode of a bad salt identical to any other env failure (exit 1 before Fastify).

## 7. Acceptance criteria
- [ ] `AUTHOR_HASH_SALT` shorter than the production minimum (or equal to the placeholder) with
      `NODE_ENV=production` → startup fails with a clear message.
- [ ] Same values in `NODE_ENV=development` still boot.
- [ ] `resolveAuthorHash` accepts an optional `tenantId` and behaves exactly as before when omitted.
- [ ] `system_04` documents the per-institution model, the rotation-as-migration rule and the runbook.
- [ ] `EXECUTION_PLAN.md` Deferred lists the per-tenant/versioned salt milestone with its trigger.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
NODE_ENV=production AUTHOR_HASH_SALT=short pnpm --filter @vozlab/api exec tsx src/index.ts  # must exit 1 with the guard message
grep -n "author_hash_salt\|hash_version" EXECUTION_PLAN.md
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-37` `[x]` in `TODO.md` with a one-line result note stating
  the production minimum and that per-tenant storage is deferred.

## 10. Out of scope
- Storing the salt per tenant, `hash_version`, dual-read, backfill (deferred milestone).
- Any change to `dev-identities.ts` pseudonyms.
