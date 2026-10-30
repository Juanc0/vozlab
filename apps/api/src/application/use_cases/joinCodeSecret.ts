import { randomBytes } from 'node:crypto';
import { hashOpaqueToken } from '../../shared/auth/refreshToken.js';

/**
 * The one code path for workspace join secrets (DEC-5 D3, ADR-0045):
 * a 24-hex uppercase random value, stored only as its SHA-256. Create,
 * rotate and the workspace default all share this helper so the secret's
 * shape never forks. The raw value exists once — in the caller's answer.
 */
export function generateJoinCodeSecret(): { raw: string; codeHash: string } {
  const raw = randomBytes(12).toString('hex').toUpperCase();
  return { raw, codeHash: hashOpaqueToken(raw) };
}
