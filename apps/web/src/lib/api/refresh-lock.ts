/**
 * Serialising the refresh across the tabs of the origin.
 *
 * The refresh token is an opaque `HttpOnly` cookie, so it is shared by every
 * tab of the origin — even though the access token is per tab, in memory.
 * The API rotates the cookie on every refresh and treats the presentation of
 * an already-rotated token as **token reuse**, which revokes the whole
 * family (the refresh rotation of Batch 1V).
 *
 * That is the right default for a stolen cookie. It has one false positive:
 * two tabs that restore their session at the same time present the same
 * cookie, the first one wins the rotation and the second one is read as a
 * thief — so **both** tabs are logged out.
 *
 * Multi-tab is not an edge case here: FR-04 requires the workspace to be
 * isolated *per tab*, which only makes sense if a user runs several tabs.
 * The fix is to make the tabs agree on who refreshes:
 *
 * - **across tabs**: the Web Locks API is origin-scoped, so a lock held by
 *   one tab makes the others wait. The loser then reads the *rotated* cookie
 *   out of the shared cookie jar and refreshes with it.
 * - **within a tab**: the in-flight promise is shared, so two callers cannot
 *   fire two refreshes. That state lives on the {@link ApiClient} instance —
 *   one client per request/tab — and not in a module global, so it cannot
 *   leak between unrelated clients.
 *
 * The server-side alternative — a grace window that returns the same
 * successor token for a reuse inside it — is the API's decision to make; it
 * would weaken the theft detection and is not the client's to take.
 */

/** The name of the origin-scoped lock. */
const REFRESH_LOCK_NAME = 'vozlab:refresh';

/**
 * Runs `operation` while holding the origin-scoped lock.
 *
 * Falls back to running it directly when the Web Locks API is unavailable:
 * the in-tab deduplication still holds, only the cross-tab coordination is
 * lost.
 */
export async function runUnderRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    return operation();
  }

  // `locks.request` is typed as `Promise<Promise<T>>` when the callback
  // returns a promise; awaiting it flattens the two levels.
  return await locks.request(REFRESH_LOCK_NAME, operation);
}

/** `true` when the origin can coordinate the refresh across its tabs. */
export function supportsCrossTabRefreshLock(): boolean {
  return typeof globalThis.navigator?.locks?.request === 'function';
}
