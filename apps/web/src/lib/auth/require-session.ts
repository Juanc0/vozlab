/**
 * The seam that sends the user back to the login.
 *
 * Two failures end the session of a tab:
 *
 * - a `401`: the access token is gone. The client already cleared the session;
 * - - a `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`: the active workspace is no
 *   longer permitted. The client already switched to another permitted
 *   workspace — but when **none** is left, the tab has to go back to the
 *   login, otherwise it would sit on a page that can never load again.
 *
 * The first batch that fetches graph data owns that path; this module is it.
 */

import { goto } from '$app/navigation';
import { isApiError } from '$lib/api/errors';
import type { WorkspaceState } from '$lib/state/workspace.svelte';
import { loginRedirectPath } from './login-redirect';

/**
 * Redirects to the login when the failure is an authentication failure.
 *
 * Returns `true` when it navigated; `false` when the failure is an ordinary
 * API error the caller has to show.
 */
export async function redirectToLoginOnAuthFailure(
  error: unknown,
  workspace: WorkspaceState,
  currentPath: string
): Promise<boolean> {
  if (!isApiError(error)) {
    return false;
  }

  const sessionGone = error.status === 401;
  const workspaceGone =
    error.status === 403 &&
    error.code === 'ERR_UNAUTHORIZED_WORKSPACE_ACCESS' &&
    // The client already switched to a permitted workspace; when there is
    // none left, the tab has nowhere else to go.
    workspace.currentWorkspaceId === '';

  if (!sessionGone && !workspaceGone) {
    return false;
  }

  const next = loginRedirectPath(currentPath, null);
  await goto(`/login?next=${encodeURIComponent(next)}`);
  return true;
}
