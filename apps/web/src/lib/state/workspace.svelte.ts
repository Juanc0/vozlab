/**
 * Per-tab workspace state (FR-04).
 *
 * `sessionStorage` is scoped to a **tab**: switching the workspace in one tab
 * never affects another one. `localStorage` is shared by every tab of the
 * origin, so it must never be used for the active workspace — this module
 * never touches it.
 *
 * The active workspace is deliberately **not** a URL path segment: the URL
 * stays clean (`/`, `/proposals`, …) and the workspace is read from the
 * storage by the HTTP client.
 *
 * The instance is created per request on the server (where the storage does
 * not exist and the state stays empty) and per tab in the browser. It is
 * handed to the tree through the Svelte context API — a module-level
 * singleton would leak one user's workspace into another user's request.
 */

import { isModeratorOrAdmin, type WorkspaceRole, type WorkspaceSummaryDto } from '@vozlab/shared-types';
import { browser } from '$app/environment';

/** Storage key of the active workspace id. Per tab, never `localStorage`. */
export const ACTIVE_WORKSPACE_STORAGE_KEY = 'vozlab_active_workspace';

export class WorkspaceState {
  /** Id of the active workspace; empty when no workspace is selected. */
  currentWorkspaceId = $state('');

  /** The workspaces the user is a member of (`GET /auth/me`). */
  workspaces = $state<WorkspaceSummaryDto[]>([]);

  /** The role the user holds **in the active workspace**. */
  role = $state<WorkspaceRole>('MEMBER');

  /** `true` when the active workspace is an `ADMIN` workspace. */
  isAdmin = $derived(this.role === 'ADMIN');

  /**
   * `true` when the user may resolve governance items (auto-apply).
   *
   * This is the shared `isModeratorOrAdmin` predicate: it is `true` for
   * `MODERATOR` **and** `ADMIN`. There is no `VIEWER` role — every membership
   * role may create nodes, edges, proposals and votes; only the resolution
   * actions are restricted, and the API re-checks them anyway.
   */
  isModerator = $derived(isModeratorOrAdmin(this.role));

  constructor() {
    if (browser) {
      this.currentWorkspaceId = sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ?? '';
    }
  }

  /** Activates a workspace and persists the choice for this tab. */
  setWorkspace(id: string): void {
    this.currentWorkspaceId = id;
    this.role = this.workspaces.find((workspace) => workspace.id === id)?.role ?? 'MEMBER';

    if (!browser) {
      return;
    }
    if (id === '') {
      sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, id);
  }

  /**
   * Reconciles the persisted workspace with the memberships from `/auth/me`.
   *
   * A persisted id the user is no longer a member of (the membership was
   * revoked, or it belongs to another tenant) is **dropped**: sending it
   * would answer `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS` on every request.
   */
  hydrate(workspaces: WorkspaceSummaryDto[]): void {
    this.workspaces = workspaces;

    const permitted = new Set(workspaces.map((workspace) => workspace.id));
    if (this.currentWorkspaceId !== '' && permitted.has(this.currentWorkspaceId)) {
      this.role = workspaces.find((workspace) => workspace.id === this.currentWorkspaceId)?.role ?? 'MEMBER';
      return;
    }

    this.currentWorkspaceId = '';
    this.role = 'MEMBER';
    if (browser) {
      sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    }
  }

  /**
   * Moves the active workspace to one the user is still a member of.
   *
   * Used when the API rejects the current workspace
   * (`403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`). The rejected workspace is
   * never picked again. Returns the newly activated workspace id, or `null`
   * when no other workspace is permitted — the caller then has to send the
   * user back to the login page.
   */
  switchToPermittedWorkspace(): string | null {
    const next = this.workspaces.find((workspace) => workspace.id !== this.currentWorkspaceId);
    if (!next) {
      this.setWorkspace('');
      return null;
    }

    this.setWorkspace(next.id);
    return next.id;
  }
}
