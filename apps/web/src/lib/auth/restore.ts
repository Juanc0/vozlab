/**
 * Restoring the session in the browser.
 *
 * The access token lives **in memory only**, so a page reload loses it. The
 * only way back is the `HttpOnly` refresh cookie: `POST /auth/refresh`
 * exchanges it for a new access token, and `GET /auth/me` then tells the app
 * which workspaces the user belongs to.
 *
 * The restore therefore happens **in the browser**, never on the server: the
 * server cannot read the cookie of another origin and the token is not in the
 * HTML. The server renders the shell; the `(app)` layout restores the
 * session on mount.
 *
 * This module holds the logic on its own (and not inside the component) so it
 * can be unit tested with a stubbed HTTP client.
 */

import { fetchMe, refreshSession } from '$lib/api/auth';
import { isApiError, type ApiError } from '$lib/api/errors';
import type { ApiClient } from '$lib/api/client';
import type { SessionState } from '$lib/state/session.svelte';
import type { WorkspaceState } from '$lib/state/workspace.svelte';
import type { AuthSessionDto, WorkspaceSummaryDto } from '@vozlab/shared-types';

/**
 * What the restore found.
 *
 * - `restored`: the session is valid and at least one workspace is permitted.
 * - `no-membership`: the session is valid but the user belongs to no
 *   workspace of this institution. That is **not** an error: an
 *   institutional login without a membership answers with an empty list.
 * - `unauthenticated`: there is no session and none could be created (no
 *   cookie, expired cookie, `401`). The user has to sign in again.
 * - `failed`: the API could not be reached or answered with a server error.
 *   The session may still be valid, so this is not the same as
 *   `unauthenticated`.
 */
export type SessionRestoreStatus = 'restored' | 'no-membership' | 'unauthenticated' | 'failed';

/** The result of a restore. */
export interface SessionRestoreOutcome {
  /** What the restore found. */
  readonly status: SessionRestoreStatus;
  /** The memberships of the user; empty unless the restore succeeded. */
  readonly workspaces: readonly WorkspaceSummaryDto[];
  /** The API error, when the restore failed. */
  readonly error: ApiError | null;
}

/** The collaborators of a restore. */
export interface SessionRestoreDeps {
  /** The HTTP client (bound to the session and the workspace state). */
  readonly client: ApiClient;
  /** The in-memory session. */
  readonly session: SessionState;
  /** The per-tab workspace state. */
  readonly workspace: WorkspaceState;
}

/**
 * Restores the session of the current tab.
 *
 * When an access token is already in memory (the user just joined an event,
 * for instance) the refresh call is skipped; the memberships are loaded
 * either way.
 */
export async function restoreSession(deps: SessionRestoreDeps): Promise<SessionRestoreOutcome> {
  const { client, session } = deps;

  if (session.accessToken === null) {
    try {
      const restored = await refreshSession(client);
      session.setSession(restored);
    } catch (error) {
      session.clear();
      return { status: statusOf(error), workspaces: [], error: errorOf(error) };
    }
  }

  return loadMemberships(deps);
}

/**
 * Adopts a session the API just handed out and loads the memberships.
 *
 * The event join answers with a full session; the app adopts it the same way
 * a restored session is adopted.
 */
export async function adoptSession(
  deps: SessionRestoreDeps,
  sessionDto: AuthSessionDto
): Promise<SessionRestoreOutcome> {
  deps.session.setSession(sessionDto);
  return loadMemberships(deps);
}

/**
 * Loads the memberships of the authenticated user.
 *
 * The persisted workspace is kept when the user is still a member of it;
 * otherwise the first membership becomes the active one. A user without any
 * membership gets the explicit `no-membership` state instead of a redirect
 * loop.
 */
export async function loadMemberships(deps: SessionRestoreDeps): Promise<SessionRestoreOutcome> {
  const { client, session, workspace } = deps;

  let me;
  try {
    me = await fetchMe(client);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      // The client already dropped the token; drop the rest of the session.
      session.clear();
    }
    return { status: statusOf(error), workspaces: [], error: errorOf(error) };
  }

  // The development sign-in adopts a bare bearer token: there is no session
  // payload with a user, so the one `/auth/me` answers with fills the gap.
  // A restored session already carries its user.
  if (session.user === null) {
    session.setUser({
      id: me.id,
      fullName: me.fullName,
      anonymousAlias: me.anonymousAlias,
      provider: me.provider,
      systemRole: me.systemRole,
      authorHash: me.authorHash
    });
  }

  // The tenant switcher needs the router identity the API resolved for this
  // tenant user (v6/TASK-01: the loop is closed with `POST /auth/switch-tenant`).
  session.globalUserId = me.globalUserId;
  session.currentTenantId = me.tenantId;

  workspace.hydrate(me.workspaces);

  if (me.workspaces.length === 0) {
    return { status: 'no-membership', workspaces: [], error: null };
  }

  if (workspace.currentWorkspaceId === '') {
    // Nothing was persisted for this tab (or the persisted workspace is not
    // permitted any more): the first membership becomes the active one.
    workspace.setWorkspace(me.workspaces[0].id);
  }

  return { status: 'restored', workspaces: me.workspaces, error: null };
}

/** A `401` means "no session"; anything else is a failure of the call. */
function statusOf(error: unknown): SessionRestoreStatus {
  return isApiError(error) && error.status === 401 ? 'unauthenticated' : 'failed';
}

/** The API error, or `null` when the failure was not an API envelope. */
function errorOf(error: unknown): ApiError | null {
  return isApiError(error) ? error : null;
}
