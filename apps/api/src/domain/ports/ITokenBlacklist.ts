/**
 * Port: access-token revocation.
 *
 * The implementation is Redis-backed; the application only needs the ability
 * to revoke a `jti` for the token's remaining lifetime and ask whether a token
 * is revoked.
 */
export interface ITokenBlacklist {
  isBlacklisted(jti: string): Promise<boolean>;
  revoke(jti: string, ttlSeconds: number): Promise<void>;
}
