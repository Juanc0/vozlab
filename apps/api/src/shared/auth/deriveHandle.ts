/** `auth.users.handle` is a varchar(64). */
const HANDLE_MAX_LENGTH = 64;

/**
 * Derive the user's search alias (v6/TASK-03, B14).
 *
 * Preference order: the IdP's `preferred_username`, the email's local-part,
 * and finally the stable subject with the fixed prefix `u-` (subjects are
 * opaque but never empty). The result is normalized to `[a-z0-9_-]`, lower,
 * at most 64 characters, with no leading or trailing dash.
 *
 * The derivation is deterministic — the same profile always maps to the
 * same alias — so a login repairs rows created before this rule existed.
 * Uniqueness is the persistence boundary's problem: a collision leaves the
 * alias NULL rather than failing the login (see `DrizzleUserRepository.freeHandle`).
 * The handle is a lookup key for the admin's direct add, not a credential.
 */
export function deriveHandle(identity: {
  preferredUsername?: string | null;
  email: string | null;
  subject: string;
}): string {
  const localPart = identity.email ? identity.email.split('@')[0] ?? null : null;
  const candidates = [
    identity.preferredUsername,
    localPart,
    `u-${identity.subject}`,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeHandle(candidate);
    if (normalized !== null) return normalized;
  }
  // The `u-${subject}` candidate always normalizes to at least the letter
  // 'u', so this line is unreachable for any subject the adapter validates.
  // Throwing keeps the contract (`string`, never empty) honest if that
  // invariant ever breaks.
  throw new Error('deriveHandle: subject produced an empty alias');
}

function normalizeHandle(value: string | null | undefined): string | null {
  const lowered = value?.trim().toLowerCase() ?? '';
  const stripped = lowered
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, HANDLE_MAX_LENGTH);
  return stripped === '' ? null : stripped;
}
