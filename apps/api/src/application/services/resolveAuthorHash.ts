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
 * The salt is conceptually **per institution**, not per user/workspace. Today
 * a single process-wide value (`env.AUTHOR_HASH_SALT`) is used for every
 * tenant; a future `SaltProvider` will resolve `tenantId -> salt` from the
 * router DB (per-tenant storage + `hash_version` re-keying, deferred — see
 * `EXECUTION_PLAN.md`). Passing `tenantId` now is optional and a no-op, so the
 * swap is a one-line provider change with no call-site churn.
 *
 * @param raw      A raw `authorHash` claim / resolved hash, if any.
 * @param subject  The authenticated subject (`sub`) to fall back to.
 * @param tenantId Internal tenant id; reserved for the future per-tenant
 *                 `SaltProvider`. Omitted callers keep the global salt.
 */
export function resolveAuthorHash(
  raw: string | undefined,
  subject: string,
  tenantId?: string,
): AuthorHash {
  return AuthorHash.fromRawOrIdentity(raw || subject, resolveSalt(tenantId));
}

/**
 * Resolve the salt for a tenant.
 *
 * Current implementation ignores `tenantId` and returns the global
 * `env.AUTHOR_HASH_SALT`. The future per-tenant implementation will read the
 * salt from the router DB here.
 */
function resolveSalt(_tenantId?: string): string {
  return env.AUTHOR_HASH_SALT;
}
