/**
 * Which credential class a router-directory hash belongs to (ADR-0046).
 * `EVENT` is redeemed by the anonymous QR join path; `INVITATION` is the
 * future DEC-9 class — declared now so the directory's CHECK vocabulary and
 * this port agree.
 */
export type CredentialRouteKind = 'EVENT' | 'INVITATION';

/**
 * Port: the thin L0 credential directory in the router DB (ADR-0046).
 *
 * A pre-tenant credential (an event QR) is presented before the API knows
 * which institution owns it. This port answers exactly one question —
 * "which tenant?" — and carries NO authority: a route is a directory entry,
 * never a grant. Redemption authority (expiry, capacity, revocation,
 * purpose) lives in the tenant's `auth.workspace_join_codes`. A route whose
 * tenant credential is missing, revoked or expired is inert: the caller
 * sees the same 404 as for an unknown code.
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
}
