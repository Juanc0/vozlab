/**
 * Peppered email hash for the database scripts.
 *
 * DEC-4 (docs/analysis/db-identity-normalization.md): every email-derived
 * hash in the platform is `HMAC-SHA-256(lower(trim(email)), EMAIL_PEPPER)`.
 * This mirrors `hashEmail` in `apps/api/src/shared/auth/refreshToken.ts`
 * exactly; scripts may not import apps/api code, so the six lines live here
 * too. If either side changes, the invitation/vault hashes stop matching.
 */
import { createHmac } from 'node:crypto';

export function emailHashPeppered(email: string, pepper: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

/**
 * Read and validate `EMAIL_PEPPER` from the environment the same way the
 * API does (required, at least 32 characters): a missing or weak pepper is
 * a hard error, never a silent fallback.
 */
export function requireEmailPepper(): string {
  const pepper = process.env.EMAIL_PEPPER;
  if (typeof pepper !== 'string' || pepper.length < 32) {
    throw new Error(
      'EMAIL_PEPPER must be set (at least 32 chars) — see DEC-4 / .env.example'
    );
  }
  return pepper;
}
