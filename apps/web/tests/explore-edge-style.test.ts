import { describe, expect, it } from 'vitest';
import {
  EDGE_STYLE_PRESETS,
  EDGE_STYLES,
  edgeStyleProperties
} from '$lib/graph/explore/edge-style';
import { routeOrthogonal, type Box } from '$lib/graph/explore/orthogonal';

const SOURCE: Box = { cx: 0, cy: 0, width: 40, height: 40 };
const TARGET: Box = { cx: 200, cy: 200, width: 40, height: 40 };

describe('the shape of the relations', () => {
  it('offers the six shapes', () => {
    expect(EDGE_STYLES).toEqual([
      'straight',
      'orthogonal',
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

  it('draws the right angles with the taxi curve and the turn of the route', () => {
    const route = routeOrthogonal(SOURCE, TARGET, []);
    const properties = edgeStyleProperties('orthogonal', route);

    expect(properties['curve-style']).toBe('taxi');
    expect(properties['taxi-direction']).toBe(route.axis);
    expect(properties['taxi-turn']).toBe(`${Math.round(route.turnRatio * 100)}%`);
    expect(properties['taxi-radius']).toBe(0);
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
});
