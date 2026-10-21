import { describe, expect, it } from 'vitest';
import {
  EDGE_STYLE_PRESETS,
  EDGE_STYLES,
  edgeStyleProperties
} from '$lib/graph/explore/edge-style';

describe('the shape of the relations', () => {
  it('offers the five shapes that are left', () => {
    expect(EDGE_STYLES).toEqual([
      'straight',
      'bezier',
      'unbundled',
      'arc',
      'haystack'
    ]);
  });

  it('draws a single line with the straight shape', () => {
    const properties = edgeStyleProperties('straight');

    expect(properties['curve-style']).toBe('straight');
    expect(properties['control-point-distances']).toBe(0);
  });

  it('draws the curves with the control point they ask for', () => {
    expect(edgeStyleProperties('bezier')['curve-style']).toBe('bezier');
    expect(edgeStyleProperties('unbundled')['curve-style']).toBe('unbundled-bezier');
    expect(edgeStyleProperties('arc')['curve-style']).toBe('bezier');
    expect(edgeStyleProperties('haystack')['curve-style']).toBe('haystack');
  });

  it('draws the arc as a wide curve', () => {
    expect(edgeStyleProperties('arc')['control-point-distances']).toBeGreaterThan(
      edgeStyleProperties('bezier')['control-point-distances'] as number
    );
  });

  it('has a preset for every shape', () => {
    for (const style of EDGE_STYLES) {
      expect(EDGE_STYLE_PRESETS[style].id).toBe(style);
    }
  });

  it('has no shape with right angles, and no shape that is routed', () => {
    // The route with right angles was in the interface and the user did not
    // like it. The shape is gone, and with it the router that computed the
    // turn: no shape asks for a route any more.
    for (const style of EDGE_STYLES) {
      const properties = edgeStyleProperties(style);

      expect(properties['curve-style']).not.toBe('taxi');
      expect(properties['taxi-direction']).toBeUndefined();
      expect(properties['taxi-turn']).toBeUndefined();
      expect(properties['taxi-radius']).toBeUndefined();
    }
  });
});
