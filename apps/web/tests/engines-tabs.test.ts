/**
 * The comparison of the engines: **one workspace, one engine at a time**.
 *
 * The tests assert the three promises of the surface:
 *
 * - the engines are a **real tablist**: the arrow keys move between them
 *   and the selected one is announced;
 * - choosing a tab **mounts** that engine and **unmounts** the previous
 *   one — only one canvas draws at a time;
 * - the **measurements belong to the engine being looked at**: they are
 *   measured on it and they are never carried over from the one before.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import EngineComparison from '$lib/dev/engines/EngineComparison.svelte';
import EngineTabs from '$lib/dev/engines/EngineTabs.svelte';
import { json, renderGovernance } from './harness/governance';
import { localeContext } from './harness/locale';
import { EDGE, NODE_A, NODE_B } from './fixtures/graph';

/**
 * The canvas of Cytoscape is **stubbed**: the tests are about the frame,
 * the tabs and the attribution of the measurements — not about the
 * drawing.
 */
vi.mock('../src/lib/components/ExplorationCanvas.svelte', async () => ({
  default: (await import('./fixtures/StubCytoscapeCanvas.svelte')).default
}));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** Renders the comparison with a window that answers. */
async function renderComparison(): Promise<void> {
  const fetchMock = vi.fn(async () => json({ nodes: [NODE_A, NODE_B], edges: [EDGE] }));

  renderGovernance(EngineComparison, { fetch: fetchMock });

  await waitFor(() => {
    expect(screen.getByTestId('cytoscape-canvas')).toBeInTheDocument();
  });
}

describe('the tabs of the engines', () => {
  it('are a tablist: the arrow keys move between them and the selected one is announced', async () => {
    const onselect = vi.fn();

    render(EngineTabs, {
      context: localeContext(),
      props: {
        active: 'dagre',
        onselect,
        panelId: 'engine-panel',
        tabId: (engine: string) => `engine-tab-${engine}`
      }
    });

    const tabs = screen.getAllByRole('tab');

    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAccessibleName('Cytoscape + dagre');
    expect(tabs[2]).toHaveAccessibleName('Cytoscape + d3-dag');

    // The selected tab is the only one in the tab order, and it is the one
    // that is announced as selected.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    // The tablist is a single stop in the tab order.
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Los motores, de uno en uno');

    await fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(onselect).toHaveBeenCalledWith('d3');

    await fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(onselect).toHaveBeenCalledWith('dag');

    await fireEvent.keyDown(tabs[0], { key: 'Home' });
    expect(onselect).toHaveBeenCalledWith('dagre');

    await fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(onselect).toHaveBeenCalledWith('dag');
  });
});

describe('the comparison of the engines', () => {
  it('has the frame of the graph page: the picture fills the workspace and the panels float over it', async () => {
    await renderComparison();

    const toolbar = screen.getByRole('region', { name: 'La barra de los motores' });
    const readout = screen.getByRole('region', { name: 'Las medidas del motor' });

    // The panels float over the picture: they are absolute, not in the flow.
    expect(toolbar.className).toContain('absolute');
    expect(readout.className).toContain('absolute');

    // The workspace is the window: the picture is on the ground and the
    // page does not scroll.
    const ground = document.querySelector('.bg-ground');
    expect(ground).not.toBeNull();
    expect(ground?.className).toContain('overflow-hidden');

    // The panel of the tabs is labelled by the tab that is on screen.
    const panel = screen.getByRole('tabpanel');
    const label = document.getElementById(panel.getAttribute('aria-labelledby') ?? '');
    expect(label?.textContent?.trim()).toBe('Cytoscape + dagre');
  });

  it('mounts the engine that is chosen and unmounts the one that was there', async () => {
    await renderComparison();

    // Only one canvas draws at a time.
    expect(screen.getAllByRole('img')).toHaveLength(1);

    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-force' }));

    await waitFor(() => {
      expect(screen.getByTestId('cytoscape-canvas')).toHaveAttribute('data-layout', 'd3');
    });

    expect(screen.getAllByRole('img')).toHaveLength(1);

    // The clone of dagre is mounted in the same space, and the canvas of
    // the living spring is gone.
    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-dag' }));

    await waitFor(() => {
      expect(screen.getByTestId('cytoscape-canvas')).toHaveAttribute('data-layout', 'dag');
    });

    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('keeps the arrangement of each engine: the one that is mounted arranges the picture its own way', async () => {
    await renderComparison();

    expect(screen.getByTestId('cytoscape-canvas')).toHaveAttribute('data-layout', 'dagre');

    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-dag' }));

    await waitFor(() => {
      expect(screen.getByTestId('cytoscape-canvas')).toHaveAttribute('data-layout', 'dag');
    });

    // The layered arrangements carry their own note: a hierarchy does not
    // breathe, and the interface says so.
    expect(screen.getByTestId('hierarchy-note')).toHaveTextContent(
      'Una jerarquía no respira: sus rangos son el dibujo.'
    );

    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-force' }));

    await waitFor(() => {
      expect(screen.getByTestId('cytoscape-canvas')).toHaveAttribute('data-layout', 'd3');
    });

    expect(screen.queryByTestId('hierarchy-note')).toBeNull();
  });

  it('reports the measurements of the engine that is on screen, and never the ones of the one before', async () => {
    await renderComparison();

    // The arrangement of `dagre` took eleven milliseconds.
    await waitFor(() => {
      expect(screen.getByText(/11\.0 ms en total/)).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-force' }));

    // The readout follows the engine: the numbers of `d3` are shown, and the
    // ones of `dagre` are gone — they were not carried over.
    await waitFor(() => {
      expect(screen.getByText(/22\.0 ms en total/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/11\.0 ms en total/)).toBeNull();

    // The clone of dagre is a third engine, and its measurement is its own.
    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-dag' }));

    await waitFor(() => {
      expect(screen.getByText(/33\.0 ms en total/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/22\.0 ms en total/)).toBeNull();
  });

  it('offers the list as the text alternative of the picture', async () => {
    await renderComparison();

    expect(screen.queryByRole('region', { name: 'Los nodos del subgrafo' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Ver la lista' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Los nodos del subgrafo' })).toBeInTheDocument();
    });
  });
});
