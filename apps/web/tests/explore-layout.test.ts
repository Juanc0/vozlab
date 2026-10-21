import { describe, expect, it } from 'vitest';
import {
  BASE_NODE_SEPARATION,
  EXPANDED_NODE_SEPARATION,
  exploreLayoutOptions,
  nodeSeparation,
  pinTransform
} from '$lib/graph/explore/layout';

describe('the layout of the exploration view', () => {
  it('is deterministic: dagre, never a physics simulation', () => {
    const options = exploreLayoutOptions({ expandedCount: 0 });

    expect(options.name).toBe('dagre');
    expect(options.animate).toBe(false);
  });

  it('grows the separation with the number of expanded nodes', () => {
    expect(nodeSeparation(0)).toBe(BASE_NODE_SEPARATION);
    expect(nodeSeparation(1)).toBe(BASE_NODE_SEPARATION + EXPANDED_NODE_SEPARATION);
    expect(nodeSeparation(3)).toBe(BASE_NODE_SEPARATION + 3 * EXPANDED_NODE_SEPARATION);
  });

  it('uses the separation in the layout', () => {
    expect(exploreLayoutOptions({ expandedCount: 2 }).nodeSep).toBe(nodeSeparation(2));
  });

  it('ignores a count that is not a number', () => {
    expect(nodeSeparation(Number.NaN)).toBe(BASE_NODE_SEPARATION);
    expect(nodeSeparation(-4)).toBe(BASE_NODE_SEPARATION);
  });

  it('pins the node the user dragged', () => {
    const pinned = new Map([['a', { x: 10, y: 20 }]]);
    const transform = pinTransform(pinned);

    expect(transform({ id: () => 'a' }, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });

  it('leaves the other nodes where the layout puts them', () => {
    const pinned = new Map([['a', { x: 10, y: 20 }]]);
    const transform = pinTransform(pinned);

    expect(transform({ id: () => 'b' }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it('hands the pinning to the layout', () => {
    const pinned = new Map([['a', { x: 10, y: 20 }]]);
    const options = exploreLayoutOptions({ expandedCount: 0, pinned });

    expect(options.transform).toBeTypeOf('function');
    expect(options.transform?.({ id: () => 'a' } as never, { x: 0, y: 0 })).toEqual({
      x: 10,
      y: 20
    });
  });
});
