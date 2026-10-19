import { createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const TENANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[a-f0-9]{64}$/;

/**
 * Opaque refresh token: `v1.<tenant UUID>.<32 random bytes as hex>`.
 *
 * The tenant UUID is routing metadata, not a secret: it tells the API which
 * physical tenant DB holds the session row. The credential's authority comes
 * from the 256-bit random part and the hashed DB row, not from the prefix.
 */
export function generateRefreshToken(tenantId: string): string {
  if (!TENANT_UUID_RE.test(tenantId)) {
    throw new Error('generateRefreshToken requires a tenant UUID');
  }
  return `${VERSION}.${tenantId}.${randomBytes(32).toString('hex')}`;
}

export function parseRefreshToken(
  token: string
): { tenantId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [version, tenantId, secret] = parts;
  if (version !== VERSION) return null;
  if (!tenantId || !TENANT_UUID_RE.test(tenantId)) return null;
  if (!secret || !SECRET_RE.test(secret)) return null;

  return { tenantId };
}

/** Store only the hash: a leaked table does not yield usable credentials. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Random 64-hex pseudonym for a new account (ADR-0013). */
export function generateAuthorHash(): string {
  return randomBytes(32).toString('hex');
}
