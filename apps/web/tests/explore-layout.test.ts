import { describe, expect, it } from 'vitest';
import {
  EDGE_SEPARATION,
  NODE_SEPARATION,
  RANK_SEPARATION,
  exploreLayoutOptions,
  pinTransform
} from '$lib/graph/explore/layout';

describe('the layout of the exploration view', () => {
  it('is deterministic: dagre, never a physics simulation', () => {
    const options = exploreLayoutOptions();

    expect(options.name).toBe('dagre');
    expect(options.animate).toBe(false);
  });

  it('keeps the gap between two cards small', () => {
    // The card holds its own text — the title, the meta line and the body
    // are all inside its rectangle — so the gap between two cards is only
    // the air they need. Every pixel of gap is a pixel the reader does not
    // see at the readable zoom.
    expect(NODE_SEPARATION).toBeGreaterThanOrEqual(40);
    expect(NODE_SEPARATION).toBeLessThanOrEqual(60);
  });

  it('keeps the room of a relation and its label between two columns', () => {
    expect(RANK_SEPARATION).toBeGreaterThanOrEqual(60);
    expect(RANK_SEPARATION).toBeLessThanOrEqual(120);
    expect(EDGE_SEPARATION).toBeGreaterThan(0);
  });

  it('uses the separations in the layout', () => {
    const options = exploreLayoutOptions();

    expect(options.nodeSep).toBe(NODE_SEPARATION);
    expect(options.rankSep).toBe(RANK_SEPARATION);
    expect(options.edgeSep).toBe(EDGE_SEPARATION);
  });

  it('does not grow the separation with the number of expanded cards', () => {
    // The layout reserves the real height of every card, expanded or not:
    // the extra air of a bigger separation would be a hole in the picture.
    const options = exploreLayoutOptions();

    expect(options.nodeSep).toBe(NODE_SEPARATION);
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

  it('hands the pinning to the instance, not to the layout', () => {
    // The layout of `dagre` has a `transform` hook, but the library never
    // calls it: the pinned places are put back by the instance.
    const options = exploreLayoutOptions();

    expect(options.transform).toBeUndefined();
  });
});
