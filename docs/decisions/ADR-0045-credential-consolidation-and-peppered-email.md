# ADR-0045: Credential consolidation and peppered email hashes

- Status: Accepted (email section; the credential-lookup and invitation-unification
  sections will be appended as tasks T4–T7 of the same intervention land)
- Date: 2026-10-30
- Related: ADR-0013 (opaque pseudonym), ADR-0042 (cross-tenant identity in the
  router), ADR-0044 (vocabulary coherence and the migration baseline this fold
  appends to), source design record:
  `docs/analysis/db-identity-normalization.md` (DEC-4, DEC-5 D5), audit P1,
  executed by `docs/plans/identity-consolidation/v1.md` (task 3).

## Context

Email was stored in cleartext in three places — `global_users.email` (the
router vault), `auth.users.email` (every tenant) and `auth.invitations.email`
— and hashed with a plain, unsalted SHA-256 in `auth.invitations.email_hash`.
A plain email hash is enumerable offline from a dump against public email
lists, so the hash column was not the protection everyone assumed it was,
while the cleartext columns made the platform a PII repository it never
needed to be: nothing ever *displays* or *contacts* by email. The audit (P1)
also flagged the tenant copy as a per-tenant PII spread with no consumer:
account linking, invitation matching and admin search were the only readers,
and every one of them can ride on a comparison instead of the value.

## Decision

1. **No cleartext email in any table of the platform.**

   - router: `global_users.email` → `email_hash varchar(64)` with
     `idx_global_users_email_hash` (the linking lookup key). The vault stores
     the hash, never the address.
   - tenant: `auth.users.email` is **dropped entirely** (with its unique
     constraint) — the tenant knows `author_hash` + pseudonym only. Linking
     by verified email lives in the router vault, before any tenant row
     exists.
   - tenant: `auth.invitations.email` is **dropped**; `email_hash` remains and
     is now peppered.

2. **One hash rule for every email-derived value:**
   `HMAC-SHA-256(lower(trim(email)), EMAIL_PEPPER)` — a required,
   Zod-validated env secret (`EMAIL_PEPPER`, ≥ 32 chars). Normalization is
   Unicode-naive (`trim` + `toLowerCase`): that is the chosen contract, and
   any future NFKC change is a re-hash migration, not a quiet behavior edit.
   The single implementation for callers is `hashEmail(email, pepper)`
   (apps/api shared) and its byte-identical mirror `emailHashPeppered` in
   `packages/database/scripts/email-hash.ts` (scripts may not import apps/api
   code). The pepper is read at the composition root and injected into the
   use cases; domain code never touches the environment. High-entropy random
   credentials (refresh tokens, event/join codes, invitation tokens) keep the
   plain `hashOpaqueToken` — they are not dictionary-attackable.

3. **Email-based account linking in the tenant is deleted.**
   `findOrCreateByExternalIdentity` no longer compares emails and can no
   longer raise `ERR_ACCOUNT_LINK_CONFLICT` over one; identity is
   `external_identities(issuer, subject)` (tenant) and `email_hash` equality
   in the router vault where cross-IdP linking is needed. The dead
   `findOrCreateOidcUser` adapter method and the unimported
   `DirectIdentityAddUseCase` were deleted with their fakes.

4. **Search and wire surfaces lose the email bytes.**
   The tenant admin searches by `handle`/`full_name` (`findUserByEmail` is
   gone); `AuthUserDto`, `AdminUserDto`, `AdminMemberDto`, `JoinRequestDto`
   and `WorkspaceInvitationDto` no longer carry `email` (the admin/user DTOs
   carry `handle` in its place). `db:grant-tenant-admin` addresses people by
   `--handle` instead of `--email`. The **disclosed wire changes** (dev-only,
   DEC-5 D5): `GET /auth/me`, the refresh response and the admin listings drop
   `email` and gain `handle`; `POST /workspaces/:id/invitations` still *accepts*
   an `email` input (the admin types who to invite) but the platform persists
   only its hash.

5. **`global_invitations.email` survives one checkpoint longer.** The whole
   table dies in T6 of this plan; touching it here would hash a column that
   is about to stop existing. For this window the two matching substrates
   (cleartext global, peppered tenant) intentionally coexist.

## Consequences accepted

- Nothing in the platform can ever display or contact by email from the DB;
  email becomes an operational input (the admin sends the link out-of-band),
  never a stored attribute.
- A dump leaks no reversible or enumerable email data; the offline-enumeration
  attack on `invitations.email_hash` is closed by the pepper.
- Rotating or losing `EMAIL_PEPPER` invalidates every email comparison (vault
  links, pending invitations): it joins the credential tier of the backup
  plan, not the tunables.
- Every login re-hashes the asserted email and upserts the hash; the IdP
  profile is the only place the cleartext ever exists, in memory, for the
  duration of the request.
- `handle` becomes the admin-facing identity string everywhere (search,
  direct add, listings, `grant-tenant-admin`).

## Evidence

- Folds: `packages/database/migrations/router/0001_illegal_lockheed.sql`,
  `packages/database/migrations/tenant/0001_rich_firestar.sql` (append to the
  ADR-0044 baselines; the dev volume migrates forward).
- End-to-end normalization proof: the integration test "redeems a
  tenant-local invitation when the IdP email differs only in case/whitespace"
  (`apps/api/tests/integration/auth.integration.test.ts`).
- Side fix found by that test: `RedisOidcStateStore.consume` was rebuilding
  the state without `invitationToken`, silently killing OIDC-carried
  invitation redemption on the real store.

## Join-code consolidation (T4, 2026-10-30)

### Decision

1. **`workspace_join_codes` is the sole workspace join credential.** The
   static cleartext `workspaces.join_code` (routing hint, unique, revealable)
   and the unread `workspaces.auto_approve_join_code` are dropped (tenant
   fold `0002_late_masked_marvel.sql`). One mechanism, one table: every code
   is a random 24-hex secret, stored only as its SHA-256, with its own label,
   expiry, cap, revocation and auto-approve flag.
2. **Redemption is atomic (audit P4).** The read-check-increment triple
   (`findByCodeHash` → app-side validity checks → unconditional
   `incrementUse`) is replaced by ONE conditional
   `UPDATE workspace_join_codes SET used_count = used_count + 1 WHERE
   code_hash = … AND revoked_at IS NULL AND (expires_at IS NULL OR
   expires_at > now) AND (max_uses IS NULL OR used_count < max_uses)
   RETURNING` (`DrizzleWorkspaceJoinCodeRepository.consume`, modelled on
   `RouterDatabaseClient.consume`). `RequestWorkspaceAccessUseCase` claims
   the use first and then branches on the row's `auto_approve` — membership
   insert or PENDING request — inside the same transaction: a flow that
   throws rolls the claim back, so no use is ever burned for a failed join.
   Concurrent redemptions can never overbook `max_uses`.
3. **The creator is a pseudonym (audit P8.4).**
   `workspace_join_codes.created_by uuid` becomes `created_by_hash
   varchar(64)` carrying the ADR-0013 authorHash of whoever minted the code;
   `CreateInvitationUseCase` now writes the same semantics into
   `invitations.created_by` (the column was always varchar(64)). Every
   "who created this credential" column means one thing.
4. **Reveal-once everywhere.** `CreateWorkspaceUseCase` mints the workspace's
   default code row inside its creation transaction and returns the raw
   value exactly once in the answer; `RotateJoinCodeUseCase` rotates the
   workspace's most recent non-revoked row (revoke + insert in one
   transaction, inheriting its label/expiry/cap/auto-approve; a legacy
   workspace without a live row simply gets one). No API response or list
   ever carries a stored code again — the admin panel shows only metadata,
   and the UI says so honestly.

### Consequences accepted

- A leaked `workspaces` dump contains no join codes at all; a leaked
  `workspace_join_codes` dump yields only SHA-256 of 96-bit randoms.
- Rotating a code no longer touches the workspace row: the audit trail is
  the row history (revoke + create), not an overwritten column.
- A presentation of an exhausted-but-valid code to a PENDING workspace
  consumes a use even when the request is a duplicate: one secret
  presentation, one use. The alternative (a read before the claim) is the
  race this decision deletes.
- The web admin page can no longer display the workspace's current code on
  load. It never could be recovered from the hash — the old UI was showing
  a *different*, static secret; that comfort is gone by design.

### Evidence (T4)

- Fold: `packages/database/migrations/tenant/0002_late_masked_marvel.sql`.
- P4 proof: the integration test "exactly 3 of 10 parallel redemptions
  succeed" (`apps/api/tests/integration/joinCodeConsume.integration.test.ts`)
  against the migrated volume.
