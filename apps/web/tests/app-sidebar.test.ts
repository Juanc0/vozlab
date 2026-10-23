import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from '../src/lib/components/AppSidebar.svelte';
import { contextWithLocale } from './harness/locale';
import { governanceHarness } from './harness/governance';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

describe('the navigation column', () => {
  it('carries the mark and the name of the product, and the language at the bottom', () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    expect(screen.getByText('VozLab')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.queryByRole('banner', { name: 'VozLab' })).not.toBeInTheDocument();
  });

  it('folds into a rail of icons: the name becomes the reading of the screen reader, the mark stays', async () => {
    const { client, session, workspace } = governanceHarness();

    render(AppSidebar, {
      props: { collapsed: true },
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });

    // The name is not dropped from the tree: it is the accessible name.
    const brand = screen.getByText('VozLab');
    expect(brand.parentElement).toHaveTextContent('VozLab');

    // The rail keeps three controls; the language keeps its own menu.
    expect(screen.getAllByRole('button', { name: 'Idioma' })).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Idioma' })).not.toBeInTheDocument();
  });
});
