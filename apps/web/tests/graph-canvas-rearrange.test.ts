/**
 * The untangle: the toolbar raises a command and the canvas runs the
 * arrangement again.
 *
 * The ends of the chain are covered elsewhere — the toolbar test proves the
 * button calls its handler, and the painter tests prove an arrangement moves
 * the cards. This covers the link in between: a new `rearrangeTick` makes the
 * mounted canvas ask the painter for another arrangement.
 */

import { render, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import SvgGraphCanvas from '$lib/components/SvgGraphCanvas.svelte';
import { localeContext } from './harness/locale';
import { EDGE, NODE_A, NODE_B } from './fixtures/graph';

/** The props of the canvas, as the component declares them. */
type Props = ComponentProps<typeof SvgGraphCanvas>;

/** The props the canvas needs to draw the two-node picture. */
function props(rearrangeTick: number, onlayout: () => void): Props {
  return {
    nodes: [NODE_A, NODE_B],
    edges: [EDGE],
    expandedIds: new Set<string>(),
    selectedNodeId: null,
    presentedNodeId: null,
    edgeStyle: 'bezier',
    label: 'La imagen',
    onlayout,
    idleSway: false,
    rearrangeTick
  };
}

describe('the untangle of the graph view', () => {
  it('runs the arrangement again when the toolbar asks for it', async () => {
    const onlayout = vi.fn();

    const view = render(SvgGraphCanvas, {
      context: localeContext(),
      props: props(0, onlayout)
    });

    // The first arrangement belongs to the build of the picture.
    await waitFor(() => {
      expect(onlayout).toHaveBeenCalled();
    });

    onlayout.mockClear();

    await view.rerender({ rearrangeTick: 1 });

    // The command reaches the painter: it arranges the picture again and
    // reports what it did.
    await waitFor(
      () => {
        expect(onlayout).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });
});
