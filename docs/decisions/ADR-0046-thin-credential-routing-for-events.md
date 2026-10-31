# ADR-0046: Thin credential routing for event codes

- Status: Accepted
- Date: 2026-10-30
- Amends: ADR-0019 (the global event-code registry becomes a thin router
  directory; the stale "MEMBER" join-role claim is corrected to GUEST)
- Related: ADR-0002 (the router/tenant split and its pre-tenant exception),
  ADR-0045 (credential consolidation — `workspace_join_codes` is the sole
  join credential), source design record:
  `docs/analysis/db-identity-normalization.md` (DEC-3), audit §2-F2/D-5 and
  diagrams §8.6/§8.7, executed by `docs/archive/plans/identity-consolidation/v1.md`
  (task 5).

## Context

A QR code is scanned **before the tenant is known**: an anonymous attendee
presents only an opaque code (`POST /auth/event-join`, no JWT, no tenant
header). ADR-0002 forbids the router from holding tenant content, and a QR
must not carry the tenant slug (ADR-0019's opacity decision) — so something
hash-addressable must live in the router. That much of ADR-0019 stands.

What does not stand is *what* the router stored. `event_codes` held the full
credential — capacity, expiry, revocation, workspace, creator — crossing the
L0/L3 boundary (routing vs institutional membership) and creating a second
credential system that duplicated `workspace_join_codes` with different
semantics (audit D1). It also forced consumption **before** the tenant
transaction, so a tenant-side failure burned a use (the accepted trade-off of
ADR-0019), and its revocation column was never writable (audit D-5).

## Decision

1. **Router = directory only.** `public.credential_routes(credential_hash
   varchar(64) UNIQUE NOT NULL, kind varchar(12) NOT NULL CHECK IN
   ('EVENT','INVITATION'), tenant_id FK → tenants ON DELETE CASCADE,
   created_at)`. One question answered: "which institution owns this hash?"
   No capacity, no workspace, no creator, no expiry authority. `event_codes`
   is dropped. The `INVITATION` kind is declared now so the DEC-9
   invitation migration (T6/T7) reuses the same directory.
2. **Authority = tenant.** The event credential is an
   `auth.workspace_join_codes` row with a new `purpose varchar(12) NOT NULL
   DEFAULT 'WORKSPACE'` CHECK (`'WORKSPACE'`,`'EVENT'`). One mechanism, two
   credential classes (DEC-3): expiry, capacity, revocation and auto-approve
   live in the tenant that creates the membership.
3. **Both redemption paths guard their purpose inside the single atomic
   `consume`.** The authenticated `RequestWorkspaceAccessUseCase` redeems
   `WHERE purpose='WORKSPACE'`; `JoinEventUseCase` redeems
   `WHERE purpose='EVENT' AND auto_approve = true`. Unifying the table does
   not let a QR code grant an authenticated MEMBER membership — closing the
   leak the builder check flagged (P-3).
4. **Orchestration order, and the route never authorizes.** Raw code →
   SHA-256 → `credential_routes` (kind EVENT) → tenant id → open tenant →
   conditional redemption **inside the same tenant transaction** as the
   `ANONYMOUS_EVENT` user + GUEST membership + refresh family. No row —
   unknown, revoked, expired, exhausted, wrong purpose, or a route whose
   tenant credential vanished — is one answer: `404
   ERR_EVENT_CODE_INVALID`. A stale route is inert; a missing route simply
   404s and the operator can re-push. Because claim and join share one
   transaction, a tenant-side failure rolls the use back — the ADR-0019
   burn-on-failure trade-off is retired.
5. **CLI sequencing (`db:event-code`).** MINT writes the tenant EVENT row
   FIRST (auto_approve=true is mandatory for EVENT rows; the redemption
   statement enforces it), then the idempotent route upsert
   (`ON CONFLICT (credential_hash) DO NOTHING`). A transaction cannot span
   the two physical databases (ADR-0002), so this is sequencing, not
   atomicity: the ordering chosen is the one whose failure mode is inert.
   `--revoke <code|hash>` deletes the ROUTE FIRST, then revokes the tenant
   row. Completing revocation's half-life (audit D-5) gains its first writer.
6. **The QR stays opaque.** The raw code alone is the payload; no tenant
   slug, no workspace id. ADR-0019's opacity decision stands unchanged — only
   its registry *responsibility* exception is recast as pure routing.

## Correction to ADR-0019

ADR-0019 §Decision states the success path "inserts the `MEMBER`
membership". The code — blessed by CI's fresh fold on 2026-10-30 and by the
v6 semantics before it — creates **`GUEST`**: anonymous event participants
get the lowest role in a kind-EVENT workspace; only institutional users reach
MEMBER and above. ADR-0019's body is append-only history; this record is the
correction, and `Amended by` now appears on ADR-0019's header.

## Consequences

### Positive

- One credential manager (`workspace_join_codes`) with a purpose class, per
  the one-mechanism-per-concept rule; the router table list shrinks back
  toward tenants + connections + a pure directory.
- Redemption atomicity and rollback both live in one physical DB; capacity
  can no longer be charged by a failed join, and a duplicate pending
  presentation no longer burns a use (T4-M1 rides the same transaction).
- Revocation is real end-to-end: CLI `--revoke` writes both sides, and a
  revoked code 404s.
- Cross-purpose presentation fails in both directions at the database level.
- The INVITATION kind pre-declares the T6/T7 path: invitations will reuse
  the same routing model instead of adding a third credential table.
  (Realized by ADR-0045's Invitation-unification section, 2026-10-30.)

### Negative / costs

- Event redemption now costs two round-trips (router directory + tenant
  transaction) instead of one router UPDATE; negligible against the
  correctness gained.
- The two DBs can transiently disagree (tenant row without a route, or vice
  versa). Both states are documented inert 404s; the CLI is the repair tool
  (re-mint / re-revoke). No reconciliation job exists yet.
- The `EVENT`-class credential is only ever minted by the CLI/seed — no API
  route creates it (unchanged from the registry's operator-only creation).
- `ERR_EVENT_CODE_INVALID` (404) replaces `ERR_EVENT_EXPIRED`/
  `ERR_EVENT_FULL` (400) on the event join; callers can no longer distinguish
  "full" from "invalid" — deliberate: the old registry distinguished them,
  and the unified conditional statement cannot without a second read, which
  would re-open state disclosure.

## Links

- `packages/database/src/schema/router.schema.ts` (`credential_routes`)
- `packages/database/src/schema/tenant.auth.schema.ts`
  (`workspace_join_codes.purpose`)
- `packages/database/migrations/router/0002_famous_deathstrike.sql`,
  `packages/database/migrations/tenant/0003_yielding_unus.sql`
- `packages/database/scripts/event-code.ts` (mint + `--revoke`)
- `apps/api/src/domain/ports/ICredentialRouteRepository.ts`
- `apps/api/src/application/use_cases/JoinEventUseCase.ts`
- `apps/api/src/application/use_cases/RequestWorkspaceAccessUseCase.ts`
- `docs/auth-and-tenancy.md` §9
- `docs/decisions/ADR-0002-two-physical-databases.md`,
  `docs/decisions/ADR-0019-global-event-codes.md`,
  `docs/decisions/ADR-0045-credential-consolidation-and-peppered-email.md`
