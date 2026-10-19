import { createHash } from 'node:crypto';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';

/**
 * Deterministic `AuthorHash` fixture for tests.
 *
 * Production pseudonyms are opaque values assigned per user at account
 * creation (`auth.users.author_hash`, random); tests only need distinct,
 * stable 64-hex values, so hashing a readable seed is the simplest source.
 */
export function testHash(seed: string): AuthorHash {
  return AuthorHash.fromString(createHash('sha256').update(seed).digest('hex'));
}
