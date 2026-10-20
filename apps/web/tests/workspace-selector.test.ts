import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceSelector from '$lib/components/WorkspaceSelector.svelte';
import { WORKSPACE_CONTEXT_KEY } from '$lib/state/context';
import { ACTIVE_WORKSPACE_STORAGE_KEY, WorkspaceState } from '$lib/state/workspace.svelte';
import type { WorkspaceSummaryDto } from '@vozlab/shared-types';

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

function renderSelector(workspaces: WorkspaceSummaryDto[], activeId?: string): WorkspaceState {
  const workspace = new WorkspaceState();
  workspace.hydrate(workspaces);
  if (activeId !== undefined) {
    workspace.setWorkspace(activeId);
  }

  render(WorkspaceSelector, {
    context: new Map<unknown, unknown>([[WORKSPACE_CONTEXT_KEY, workspace]])
  });

  return workspace;
}

describe('WorkspaceSelector', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows the active workspace and the role of its membership', () => {
    renderSelector([WORKSPACE_A, WORKSPACE_B], WORKSPACE_B.id);

    const select = screen.getByLabelText('Workspace') as HTMLSelectElement;

    expect(select.value).toBe(WORKSPACE_B.id);
    expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Research' })).toBeInTheDocument();
    expect(screen.getByText('MODERATOR')).toBeInTheDocument();
  });

  it('writes the choice to sessionStorage and updates the selector', async () => {
    const workspace = renderSelector([WORKSPACE_A, WORKSPACE_B], WORKSPACE_A.id);

    const select = screen.getByLabelText('Workspace') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: WORKSPACE_B.id } });
    await tick();

    expect(select.value).toBe(WORKSPACE_B.id);
    expect(workspace.currentWorkspaceId).toBe(WORKSPACE_B.id);
    expect(workspace.role).toBe('MODERATOR');
    expect(sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe(WORKSPACE_B.id);
    expect(screen.getByText('MODERATOR')).toBeInTheDocument();
  });

  it('never writes the workspace to localStorage', async () => {
    renderSelector([WORKSPACE_A, WORKSPACE_B], WORKSPACE_A.id);

    const select = screen.getByLabelText('Workspace') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: WORKSPACE_B.id } });
    await tick();

    expect(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('disables the selector when the user belongs to no workspace', () => {
    renderSelector([]);

    const select = screen.getByLabelText('Workspace') as HTMLSelectElement;

    expect(select.disabled).toBe(true);
    expect(select.options).toHaveLength(0);
    expect(screen.getByText(/no workspace selected/i)).toBeInTheDocument();
  });
});
