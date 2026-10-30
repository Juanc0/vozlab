# ADR-0019: Global event-code registry in the router database

- Status: Accepted — Amended by ADR-0046 (thin credential routing replaces the registry; the join-role claim corrected)
- Date: 2026-10-19
- Amends: ADR-0002 (explicit exception to the router/tenant table split)

## Context

FR-03 lets an attendee scan a QR code and join a workspace anonymously without
an institutional account. At scan time the API has no JWT, so it does not know
the tenant. Two designs were possible:

1. **Tenant-scoped `event_codes`.** The QR includes a tenant slug or URL prefix;
   the API resolves the tenant from the slug, opens that tenant DB and looks up
   the code there. This keeps the router free of event data but leaks the
   institution in the QR, requires a tenant-resolution step before the code is
   validated, and makes code collisions across tenants harmless only because
   the tenant is already known.
2. **Global registry in the router DB.** The raw code alone identifies the
   code; the row points at `tenant_id` and `workspace_id`. The router is
   queried before any tenant connection is opened. This is a deliberate
   exception to the "router holds only tenants and connections" rule in
   ADR-0002.

The selected design is the global registry. It keeps the QR opaque (a single
code, no institution identifier), makes brute-force behavior uniform, and
avoids putting tenant slugs in public URLs.

## Decision

- `public.event_codes` lives in the router DB. Columns: `id`, `tenant_id`
  (FK → `tenants.id`, cascade), `workspace_id`, `code_hash`, `label`,
  `expires_at`, `max_uses` (nullable = unlimited), `used_count`, `revoked_at`,
  `created_by_hash`, `created_at`. `code_hash` is UNIQUE.
- The QR payload is the raw code only. The CLI generates
  `vle_<24 base64url chars>`; only its SHA-256 hash is stored. The raw value is
  printed once and never logged by the API.
- Operators create codes with
  `pnpm --filter @vozlab/database db:event-code -- --tenant <slug|uuid>
  --workspace <uuid> [--label ...] [--days N] [--max-uses N]`.
  The workspace is validated against the tenant's physical `auth.workspaces`
  before insertion; there is no cross-database foreign key.
- Consumption is one conditional `UPDATE ... RETURNING`:
  `used_count = used_count + 1` only when the hash matches, the code is not
  revoked, `expires_at > now()`, and `max_uses IS NULL OR used_count < max_uses`.
  Concurrent joins cannot exceed capacity. A subsequent SELECT distinguishes
  `NOT_FOUND`, `REVOKED`, `EXPIRED` and `FULL`.
- Consumption happens **before** the tenant transaction. The code row carries
  `tenant_id`, so the use case opens the correct tenant DB only after the code
  is validated.
- On success, one tenant transaction creates the `ANONYMOUS_EVENT` user with a
  random pseudonym and alias, inserts the `MEMBER` membership (the explicit
  exception to "membership must pre-exist"), and stores the refresh session.
  The response is the same access-token + refresh-cookie session as OIDC login.
- Expiry/revocation stops **new** joins only. Existing anonymous users keep
  their refresh sessions and can continue contributing, as FR-03 requires.

## Consequences

### Positive

- The QR contains no tenant slug, institution name or workspace id; a lost
  poster reveals only the code, which can be revoked.
- Tenant resolution is a single router lookup, before any tenant pool is
  opened; an invalid code never touches a tenant DB.
- Capacity, expiry and revocation are enforced atomically in one row.
- The operator CLI validates the target workspace, avoiding codes that are
  guaranteed to fail.

### Negative / costs

- The router DB now contains tenant-scoped metadata, weakening the "router is
  only routing" invariant. This is the single documented exception; any future
  global table needs a new ADR.
- There is no cross-DB FK to `auth.workspaces`; a workspace deleted directly in
  the tenant DB leaves a stale code until it is revoked.
- Consuming the code before the tenant transaction means a tenant DB failure
  burns one use. Operators can raise `max_uses` or reissue; there is no
  compensating write across databases.
- A global code is usable only in its recorded workspace; it is not a
  cross-workspace or cross-tenant credential.
- Anonymous membership is auto-granted by the event code. This is an explicit
  exception to the "JIT login grants no membership" rule (ADR-0018); the code
  itself is the authorization.
- Rate limiting is per IP because the caller has no tenant/workspace context
  yet; NATed venues can share a bucket.

## Links

- `packages/database/src/schema/router.schema.ts` (`event_codes`)
- `packages/database/migrations/router/0001_blushing_hellcat.sql`
- `packages/database/scripts/event-code.ts`
- `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`
- `apps/api/src/application/use_cases/JoinEventUseCase.ts`
- `apps/api/src/infrastructure/http/routes.ts`
- `docs/decisions/ADR-0002-two-physical-databases.md`
- `docs/auth-and-tenancy.md`
