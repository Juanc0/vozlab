/**
 * Which credential class a router-directory hash belongs to (ADR-0046).
 * `EVENT` is redeemed by the anonymous QR join path; `INVITATION` is the
 * DEC-9 class — an invitation link presented to the OIDC callback before
 * any tenant is resolved.
 */
export type CredentialRouteKind = 'EVENT' | 'INVITATION';

/**
 * Port: the thin L0 credential directory in the router DB (ADR-0046).
 *
 * A pre-tenant credential (an event QR, an invitation token) is presented
 * before the API knows which institution owns it. This port answers exactly
 * one question — "which tenant?" — and carries NO authority: a route is a
 * directory entry, never a grant. Redemption authority (expiry, capacity,
 * revocation, purpose, email binding) lives in the tenant that issued the
 * credential (`auth.workspace_join_codes`, `auth.invitations`). A route
 * whose tenant credential is missing, revoked or expired is inert: the
 * caller treats it as if it had never existed.
 */
export interface ICredentialRouteRepository {
  /**
   * Resolve the owning tenant id for a credential hash of the given kind.
   * `null` when the directory has no such row (unknown hash or mismatched
   * kind) — never a partial match across kinds.
   */
  findTenantId(
    credentialHash: string,
    kind: CredentialRouteKind
  ): Promise<string | null>;

  /**
   * Idempotent directory insert: record `(hash, kind, tenant)` so the
   * credential becomes routable. Re-inserting the same hash is a silent
   * no-op (the mint/re-push path relies on it — DEC-3/DEC-9 sequencing:
   * the tenant authority row is committed FIRST, the route after).
   */
  ensureRoute(
    credentialHash: string,
    kind: CredentialRouteKind,
    tenantId: string
  ): Promise<void>;
}
