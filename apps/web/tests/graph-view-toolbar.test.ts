/**
 * The toolbar of the graph: three zones and the tools that live in them.
 *
 * The shape the product asked for: the title on the left, the tools of the
 * picture in the middle — the zoom and the untangle —, and the actions of the
 * screen on the right, where the create button and the inspector toggle sit.
 */

import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceToolbar from '$lib/components/WorkspaceToolbar.svelte';
import { localeContext } from './harness/locale';

/** Renders the toolbar with the props it needs, and the spies of its actions. */
function mount(): {
  zoomin: ReturnType<typeof vi.fn>;
  zoomout: ReturnType<typeof vi.fn>;
  fit: ReturnType<typeof vi.fn>;
  untangle: ReturnType<typeof vi.fn>;
} {
  const zoomin = vi.fn();
  const zoomout = vi.fn();
  const fit = vi.fn();
  const untangle = vi.fn();

  render(WorkspaceToolbar, {
    context: localeContext(),
    props: {
      viewMode: 'subgraph',
      onviewmodechange: () => {},
      listOpen: false,
      onlisttoggle: () => {},
      inspectorOpen: true,
      oninspectortoggle: () => {},
      inspectorControlsId: 'inspector-panel',
      listDescriptionId: 'list-description',
      onnewnode: () => {},
      onzoomin: zoomin,
      onzoomout: zoomout,
      onfit: fit,
      onuntangle: untangle
    }
  });

  return { zoomin, zoomout, fit, untangle };
}

describe('the toolbar of the graph', () => {
  it('carries the title, the zoom group and the untangle in one row', () => {
    mount();

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /zoom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desenredar' })).toBeInTheDocument();
  });

  it('keeps the create button and the inspector toggle on the right', () => {
    mount();

    expect(screen.getByRole('button', { name: 'Nuevo nodo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inspector/i })).toBeInTheDocument();
  });

  it('asks for the zoom and the untangle the reader chose', async () => {
    const spies = mount();

    await fireEvent.click(screen.getByRole('button', { name: 'Desenredar' }));

    expect(spies.untangle).toHaveBeenCalledTimes(1);
  });
});
