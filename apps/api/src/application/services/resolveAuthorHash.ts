import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { env } from '../../shared/config/env.js';

/**
 * Resolve the pseudonymous `AuthorHash` for an authenticated caller.
 *
 * This is the ONLY place the institutional salt (`AUTHOR_HASH_SALT`) is read.
 * The salt is infrastructure config injected via `env.ts`; the domain value
 * object stays salt-agnostic (RF-07, NFR-07).
 *
 * Rules:
 *   - A token that already carries a valid 64-hex `authorHash` (e.g. one
 *     minted by TASK-19 for a seeded maintainer) is preserved verbatim —
 *     never re-hashed.
 *   - Otherwise the hash is deterministically derived from the subject plus
 *     the configured institutional salt. Rotating the salt re-keys every
 *     derived pseudonym.
 *
 * @param raw     A raw `authorHash` claim / resolved hash, if any.
 * @param subject The authenticated subject (`sub`) to fall back to.
 */
export function resolveAuthorHash(
  raw: string | undefined,
  subject: string
): AuthorHash {
  return AuthorHash.fromRawOrIdentity(raw || subject, env.AUTHOR_HASH_SALT);
}
