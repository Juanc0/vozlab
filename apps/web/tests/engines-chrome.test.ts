/**
 * The **chrome of the comparison** — the folds and the numbers at a glance.
 *
 * The comparison exists to look at pictures: the essay is onboarding and the
 * table of twelve rows is a second read. Both are folded by default, the
 * readout keeps the three numbers that answer the question, and the size
 * selector is never blank — a value that matches no option renders an empty
 * field, and an empty field does not say what the picture is.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import EngineComparison from '$lib/dev/engines/EngineComparison.svelte';
import { json, renderGovernance } from './harness/governance';
import { EDGE, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

vi.mock('../src/lib/components/ExplorationCanvas.svelte', async () => ({
  default: (await import('./fixtures/StubCytoscapeCanvas.svelte')).default
}));

vi.mock('../src/lib/dev/engines/svg/SvgEnginePanel.svelte', async () => ({
  default: (await import('./fixtures/StubSvgPanel.svelte')).default
}));

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** Renders the comparison with a window of three nodes. */
async function renderComparison(): Promise<void> {
  const fetchMock = vi.fn(async () =>
    json({ nodes: [NODE_A, NODE_B, NODE_C], edges: [EDGE] })
  );

  renderGovernance(EngineComparison, { fetch: fetchMock });

  await waitFor(() => {
    expect(screen.getByTestId('cytoscape-canvas')).toBeInTheDocument();
  });

  // The readout arrives with the window: until it does, the panel says it is
  // loading and there is no toggle to test.
  await waitFor(() => {
    expect(screen.getByTestId('readout-kpis')).toBeInTheDocument();
  });
}

/** The readout of the engine that is on screen. */
function readout(): HTMLElement {
  return screen.getByRole('region', { name: 'Las medidas del motor' });
}

describe('the readout of the comparison', () => {
  it('starts folded and shows the three numbers of the engine', async () => {
    await renderComparison();

    const details = screen.getByTestId('readout-details');
    const toggle = screen.getByRole('button', { name: 'Todas las medidas' });

    // It starts folded, and the toggle says so.
    expect(details).not.toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', details.id);

    // The header is always visible: the name and the three numbers.
    const engine = within(readout());

    expect(engine.getByRole('heading', { name: 'Cytoscape + dagre' })).toBeVisible();

    const kpis = within(screen.getByTestId('readout-kpis'));

    expect(kpis.getByText('Marco')).toBeVisible();
    expect(kpis.getByText('2.00 ms')).toBeVisible();
    expect(kpis.getByText('Tarjetas encima')).toBeVisible();
    expect(kpis.getByText('1 par')).toBeVisible();
    expect(kpis.getByText('Estado')).toBeVisible();
    expect(kpis.getByText('Asentada')).toBeVisible();

    // The table is behind the fold.
    expect(screen.getByText('11.0 ms en total')).not.toBeVisible();
  });

  it('expands the table, announces it, and the fold survives a tab switch', async () => {
    await renderComparison();

    const toggle = screen.getByRole('button', { name: 'Todas las medidas' });
    const details = screen.getByTestId('readout-details');

    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toBeVisible();
    expect(screen.getByText('11.0 ms en total')).toBeVisible();

    // Another engine is another picture, but the same fold: the reader does
    // not have to open the table again.
    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-force' }));

    await waitFor(() => {
      expect(screen.getByText('22.0 ms en total')).toBeVisible();
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toBeVisible();

    // The closed fold survives too.
    await fireEvent.click(toggle);
    expect(details).not.toBeVisible();

    await fireEvent.click(screen.getByRole('tab', { name: 'Cytoscape + d3-dag' }));

    await waitFor(() => {
      expect(screen.getByText('33.0 ms en total')).toBeInTheDocument();
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(details).not.toBeVisible();
  });

  it('follows the engine: the living painter reports its shape, not a settled layout', async () => {
    await renderComparison();

    await fireEvent.click(screen.getByRole('tab', { name: 'SVG + d3' }));

    await waitFor(() => {
      expect(screen.getByText('55.0 ms en total')).toBeInTheDocument();
    });

    const kpis = within(screen.getByTestId('readout-kpis'));

    expect(kpis.getByText('0.50 ms')).toBeVisible();
    expect(kpis.getByText('0 pares')).toBeVisible();
    expect(kpis.getByText('Viva')).toBeVisible();
    expect(kpis.queryByText('Asentada')).toBeNull();
  });
});

describe('the essay of the comparison', () => {
  it('starts folded, opens on request and folds again', async () => {
    await renderComparison();

    const toggle = screen.getByRole('button', { name: '¿Qué es esto?' });
    const essay = screen.getByText(/Un mismo espacio para los cuatro motores/);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(essay).not.toBeVisible();

    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(essay).toBeVisible();

    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(essay).not.toBeVisible();
  });
});

describe('the size of the picture', () => {
  it('never renders an empty value, even when the window is not a preset', async () => {
    await renderComparison();

    const select = screen.getByLabelText('Tamaño de la imagen') as HTMLSelectElement;

    // Three nodes is not one of the old presets (24 and 200): the old
    // fixed default left the select blank. The window is an option of its
    // own, and it is the one that is shown.
    expect(select.value).not.toBe('');
    expect(select.value).toBe('3');
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe(
      'La demostración (3 nodos)'
    );

    // The ceiling of the API stays one choice away.
    expect(within(select).getByRole('option', { name: 'El techo de la API (200 nodos)' }))
      .toBeInTheDocument();

    await fireEvent.change(select, { target: { value: '200' } });

    expect(select.value).toBe('200');
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe(
      'El techo de la API (200 nodos)'
    );
  });
});
