import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceState, ACTIVE_WORKSPACE_STORAGE_KEY } from '$lib/state/workspace.svelte';
import type { WorkspaceSummaryDto } from '@vozlab/shared-types';

// The workspace state only touches the storage in the browser.
vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const WORKSPACE_A: WorkspaceSummaryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'general',
  name: 'General',
  role: 'ADMIN'
};

const WORKSPACE_B: WorkspaceSummaryDto = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'research',
  name: 'Research',
  role: 'MODERATOR'
};

const WORKSPACE_C: WorkspaceSummaryDto = {
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'field',
  name: 'Field',
  role: 'MEMBER'
};

describe('WorkspaceState', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('restores the persisted workspace from sessionStorage', () => {
    sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE_A.id);

    const state = new WorkspaceState();

    expect(state.currentWorkspaceId).toBe(WORKSPACE_A.id);
  });

  it('starts empty when nothing was persisted', () => {
    const state = new WorkspaceState();

    expect(state.currentWorkspaceId).toBe('');
  });

  it('persists the active workspace in sessionStorage', () => {
    const state = new WorkspaceState();

    state.setWorkspace(WORKSPACE_B.id);

    expect(state.currentWorkspaceId).toBe(WORKSPACE_B.id);
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_B.id);
  });

  it('never writes to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const state = new WorkspaceState();
    state.setWorkspace(WORKSPACE_B.id);

    expect(setItem.mock.contexts).not.toContain(window.localStorage);
    expect(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);

    setItem.mockRestore();
  });

  it('keeps the persisted workspace when the user is still a member', () => {
    sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE_A.id);

    const state = new WorkspaceState();
    state.hydrate([WORKSPACE_A, WORKSPACE_B]);

    expect(state.currentWorkspaceId).toBe(WORKSPACE_A.id);
    expect(state.role).toBe('ADMIN');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_A.id);
  });

  it('drops a persisted workspace the user is no longer a member of', () => {
    sessionStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '99999999-9999-4999-8999-999999999999');

    const state = new WorkspaceState();
    state.hydrate([WORKSPACE_A, WORKSPACE_B]);

    expect(state.currentWorkspaceId).toBe('');
    expect(state.role).toBe('MEMBER');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('derives the governance flags from the role', () => {
    const state = new WorkspaceState();

    state.hydrate([WORKSPACE_A, WORKSPACE_B, WORKSPACE_C]);

    state.setWorkspace(WORKSPACE_C.id);
    expect(state.role).toBe('MEMBER');
    expect(state.isAdmin).toBe(false);
    expect(state.isModerator).toBe(false);

    state.setWorkspace(WORKSPACE_B.id);
    expect(state.role).toBe('MODERATOR');
    expect(state.isAdmin).toBe(false);
    expect(state.isModerator).toBe(true);

    state.setWorkspace(WORKSPACE_A.id);
    expect(state.role).toBe('ADMIN');
    expect(state.isAdmin).toBe(true);
    expect(state.isModerator).toBe(true);
  });

  it('falls back to a permitted workspace when the active one is rejected', () => {
    const state = new WorkspaceState();
    state.hydrate([WORKSPACE_A, WORKSPACE_B]);
    state.setWorkspace(WORKSPACE_A.id);

    const next = state.switchToPermittedWorkspace();

    expect(next).toBe(WORKSPACE_B.id);
    expect(state.currentWorkspaceId).toBe(WORKSPACE_B.id);
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_B.id);
  });

  it('clears the active workspace when there is no other permitted workspace', () => {
    const state = new WorkspaceState();
    state.hydrate([WORKSPACE_A]);
    state.setWorkspace(WORKSPACE_A.id);

    const next = state.switchToPermittedWorkspace();

    expect(next).toBeNull();
    expect(state.currentWorkspaceId).toBe('');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('clears the active workspace when the user has no membership at all', () => {
    const state = new WorkspaceState();
    state.hydrate([]);
    state.setWorkspace(WORKSPACE_A.id);

    const next = state.switchToPermittedWorkspace();

    expect(next).toBeNull();
    expect(state.currentWorkspaceId).toBe('');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });
});
