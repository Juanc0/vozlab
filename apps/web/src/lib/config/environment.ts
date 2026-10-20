/**
 * The build environment, read through a function.
 *
 * `import { dev } from '$app/environment'` gives a constant, and a constant
 * cannot be flipped by a test. The development-only surfaces of the app —
 * the sign-in that adopts a locally minted token — are gated on it, and
 * they have to be testable, so the flag is read at call time through this
 * function instead.
 */

import { dev } from '$app/environment';

/**
 * Whether this is a development build.
 *
 * A development build may offer the development sign-in; a production build
 * must not, and the check that keeps it out of the production bundle is
 * this one.
 */
export function isDevelopmentBuild(): boolean {
  return dev;
}
