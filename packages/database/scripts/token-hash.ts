/**
 * SHA-256 hex of an opaque, high-entropy token — the scripts-package mirror
 * of `hashOpaqueToken` in `apps/api/src/shared/auth/refreshToken.ts` (plain
 * hash is deliberate: refresh tokens, event/join codes and invitation tokens
 * are random secrets, not dictionary-attackable like emails; DEC-4 routes
 * email-derived hashes through `./email-hash.js` instead).
 *
 * Scripts may not import apps/api code, so the one-liner lives here and the
 * CLIs/seed share this single copy. If either side changes, the stored hashes
 * stop matching the presented credentials.
 */
import { createHash } from 'node:crypto';

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
