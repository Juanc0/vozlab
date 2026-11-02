import { describe, expect, it } from 'vitest';
import {
  routeOrthogonal,
  segmentCrossesBox,
  type Box,
  type OrthogonalRoute
} from '$lib/graph/explore/orthogonal';

/** A node on the left of the picture. */
const SOURCE: Box = { cx: 0, cy: 0, width: 40, height: 40 };

/** A node on the right and below: the straight line between them is diagonal. */
const TARGET: Box = { cx: 200, cy: 200, width: 40, height: 40 };

/** A node that stands exactly on the straight line between the two. */
const OBSTACLE: Box = { cx: 100, cy: 100, width: 40, height: 40 };

/** The segments of a route. */
function segments(route: OrthogonalRoute): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const points = route.waypoints;
  const result: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];

  for (let index = 1; index < points.length; index += 1) {
    result.push([points[index - 1], points[index]]);
  }

  return result;
}

describe('the orthogonal router', () => {
  it('answers the waypoints of a route with right angles', () => {
    const route = routeOrthogonal(SOURCE, TARGET, []);

    expect(route.waypoints.length).toBeGreaterThanOrEqual(3);
    expect(route.axis).toBe('horizontal');
    expect(route.crossings).toBe(0);
  });

  it('keeps every segment horizontal or vertical', () => {
    const route = routeOrthogonal(SOURCE, TARGET, []);

    for (const [from, to] of segments(route)) {
      const horizontal = from.y === to.y;
      const vertical = from.x === to.x;

      expect(horizontal || vertical).toBe(true);
    }
  });

  it('does not run through a node', () => {
    const route = routeOrthogonal(SOURCE, TARGET, [OBSTACLE]);

    expect(route.crossings).toBe(0);

    for (const [from, to] of segments(route)) {
      expect(segmentCrossesBox(from, to, OBSTACLE)).toBe(false);
    }
  });

  it('starts at the edge of the source and ends at the edge of the target', () => {
    const route = routeOrthogonal(SOURCE, TARGET, []);
    const first = route.waypoints[0];
    const last = route.waypoints[route.waypoints.length - 1];

    expect(first.x).toBe(SOURCE.cx + SOURCE.width / 2);
    expect(first.y).toBe(SOURCE.cy);
    expect(last.x).toBe(TARGET.cx - TARGET.width / 2);
    expect(last.y).toBe(TARGET.cy);
  });

  it('puts the turn between the two nodes', () => {
    const route = routeOrthogonal(SOURCE, TARGET, []);

    expect(route.turnDistance).toBeGreaterThan(0);
    expect(route.turnRatio).toBeGreaterThan(0);
    expect(route.turnRatio).toBeLessThan(1);
  });

  it('degenerates gracefully with a node next to another one', () => {
    const near: Box = { cx: 60, cy: 0, width: 40, height: 40 };
    const route = routeOrthogonal(SOURCE, near, []);

    // The route answers something: it never throws and it never crosses a
    // node that is not there.
    expect(Array.isArray(route.waypoints)).toBe(true);
    expect(route.crossings).toBe(0);
  });

  it('degenerates gracefully with two nodes on top of each other', () => {
    const route = routeOrthogonal(SOURCE, { ...SOURCE }, []);

    expect(route.waypoints).toEqual([]);
    expect(route.crossings).toBe(0);
  });

  it('degenerates gracefully with a self-relation', () => {
    const route = routeOrthogonal(SOURCE, SOURCE, [OBSTACLE]);

    expect(route.waypoints).toEqual([]);
    expect(route.turnDistance).toBe(0);
  });

  it('goes around a node that stands between the two', () => {
    const straight: Box = { cx: 200, cy: 0, width: 40, height: 40 };
    const blocker: Box = { cx: 100, cy: 0, width: 20, height: 20 };
    const route = routeOrthogonal(SOURCE, straight, [blocker]);

    // The relation cannot be drawn straight: it has to leave the line.
    expect(route.crossings).toBe(0);
  });

  it('reports the crossings when there is no way around', () => {
    const straight: Box = { cx: 200, cy: 0, width: 40, height: 40 };
    const wall: Box = { cx: 100, cy: 0, width: 40, height: 400 };
    const route = routeOrthogonal(SOURCE, straight, [wall]);

    // The wall is 400 tall: there is no way around it. The route still
    // answers one, and it says how many nodes it crosses.
    expect(route.waypoints.length).toBeGreaterThan(0);
    expect(route.crossings).toBeGreaterThan(0);
  });
});
