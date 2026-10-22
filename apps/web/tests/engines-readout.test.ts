/**
 * The **readout** of the living spring.
 *
 * The spring does not settle, so the readout must not say it does: it says
 * the picture is alive, whether it is awake, and that its shape was reached
 * below a threshold of movement. The tick count is real, and the note says
 * what "at rest" means for a living picture.
 */

import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EngineReadout from '$lib/dev/engines/EngineReadout.svelte';
import { engineDescriptor } from '$lib/dev/engines/engines';
import { localeContext } from './harness/locale';

/** The measurement of a living spring at rest, below the threshold. */
const IDLE = {
  ms: 84.2,
  settled: false,
  overlaps: 0,
  ticks: 612,
  frameMs: 0.31,
  tickMs: 0.08,
  alive: true,
  awake: false,
  shapeReached: true,
  threshold: 1.5
} as const;

describe('the readout of the living spring', () => {
  it('says it is alive and moves at rest, and never says it is settled', () => {
    render(EngineReadout, {
      context: localeContext(),
      props: {
        engine: engineDescriptor('d3'),
        measurement: IDLE,
        frames: undefined,
        nodes: [],
        edges: []
      }
    });

    expect(screen.getByText('Viva: se mueve en reposo')).toBeInTheDocument();
    expect(
      screen.getByText('Alcanzada por debajo de 1,5 px por paso')
    ).toBeInTheDocument();

    // The old row of a one-pass arrangement is not shown for the spring.
    expect(screen.queryByText('Asentada')).toBeNull();
    expect(screen.queryByText('Todavía no')).toBeNull();

    expect(screen.getByTestId('alive-note')).toHaveTextContent(
      'El resorte vivo no se asienta'
    );
    expect(screen.getByTestId('alive-note')).toHaveTextContent('1,5 px por paso');

    // The real number of ticks stays in the readout.
    expect(screen.getByText('612 pasos')).toBeInTheDocument();
  });

  it('says it is awake and still looking for its shape when the hand moves it', () => {
    render(EngineReadout, {
      context: localeContext(),
      props: {
        engine: engineDescriptor('d3'),
        measurement: { ...IDLE, awake: true, shapeReached: false },
        frames: undefined,
        nodes: [],
        edges: []
      }
    });

    expect(screen.getByText('Despierta: la mano la movió')).toBeInTheDocument();
    expect(screen.getByText('Todavía buscándola')).toBeInTheDocument();
    expect(screen.queryByText('Asentada')).toBeNull();
  });
});
