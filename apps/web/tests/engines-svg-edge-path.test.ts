/**
 * The **geometry** of the SVG painter.
 *
 * The five shapes of `$lib/graph/explore/edge-style` are written as
 * `<path>` by a pure builder: the test says that the five are five, that a
 * relation is clipped at the border of the card, and that the arrow and the
 * label follow the line that is drawn.
 */

import { describe, expect, it } from 'vitest';
import {
  ARC_DISTANCE,
  BEZIER_DISTANCE,
  EDGE_DASH,
  clipToCard,
  edgeGeometry,
  readableAngle
} from '$lib/dev/engines/svg/edge-path';
import type { EdgeStyle } from '$lib/graph/explore/edge-style';

const STYLES: readonly EdgeStyle[] = ['straight', 'bezier', 'unbundled', 'arc', 'haystack'];

const SOURCE = { x: 0, y: 0, width: 140, height: 60 };
const TARGET = { x: 400, y: 120, width: 140, height: 60 };

/** Rounds a number exactly as the path builder writes it. */
function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

describe('the clip of a relation at the card', () => {
  it('meets the border of the card in the direction of the line', () => {
    // A horizontal line leaves at the right border, half a card from the
    // centre.
    expect(clipToCard({ x: 0, y: 0 }, { x: 100, y: 0 }, SOURCE)).toEqual({ x: 70, y: 0 });
    // A vertical one leaves at the bottom border.
    expect(clipToCard({ x: 0, y: 0 }, { x: 0, y: 100 }, SOURCE)).toEqual({ x: 0, y: 30 });
    // A diagonal one leaves at the nearer pair of sides.
    expect(clipToCard({ x: 0, y: 0 }, { x: 100, y: 100 }, SOURCE)).toEqual({ x: 30, y: 30 });
  });

  it('does not move a point that has no direction', () => {
    expect(clipToCard({ x: 4, y: 5 }, { x: 4, y: 5 }, SOURCE)).toEqual({ x: 4, y: 5 });
  });
});

describe('the five shapes of a relation', () => {
  it('are five different paths', () => {
    const paths = STYLES.map((style) => edgeGeometry(style, SOURCE, TARGET).path);

    expect(paths.every((path) => path.startsWith('M '))).toBe(true);
    expect(new Set(paths).size).toBe(5);
  });

  it('uses the command of every shape', () => {
    expect(edgeGeometry('straight', SOURCE, TARGET).path).toContain(' L ');
    expect(edgeGeometry('bezier', SOURCE, TARGET).path).toContain(' Q ');
    expect(edgeGeometry('unbundled', SOURCE, TARGET).path).toContain(' C ');
    expect(edgeGeometry('arc', SOURCE, TARGET).path).toContain(' Q ');
    expect(edgeGeometry('haystack', SOURCE, TARGET).path).toContain(' L ');
  });

  it('draws the wide arc with a control point farther from the line than the smooth one', () => {
    // Both are quadratic curves; the distance is the one of the module.
    expect(ARC_DISTANCE).toBeGreaterThan(BEZIER_DISTANCE);
  });

  it('puts the arrow at the end of the line, at the border of the target card', () => {
    for (const style of STYLES) {
      const geometry = edgeGeometry(style, SOURCE, TARGET);

      expect(geometry.arrow).toMatch(/^M .+ Z$/);
      expect(geometry.arrow.startsWith(`M ${round(geometry.end.x)} ${round(geometry.end.y)}`)).toBe(
        true
      );
    }
  });

  it('joins the target at its border, never at its centre', () => {
    for (const style of STYLES) {
      const geometry = edgeGeometry(style, SOURCE, TARGET);

      expect(Math.abs(geometry.end.x - TARGET.x)).toBeLessThanOrEqual(TARGET.width / 2 + 0.001);
      expect(Math.abs(geometry.end.y - TARGET.y)).toBeLessThanOrEqual(TARGET.height / 2 + 0.001);
    }
  });

  it('starts the haystack inside the source card, under it, and the straight line at its border', () => {
    const haystack = edgeGeometry('haystack', SOURCE, TARGET);
    const straight = edgeGeometry('straight', SOURCE, TARGET);

    const inside = (point: { x: number; y: number }): boolean =>
      Math.abs(point.x - SOURCE.x) < SOURCE.width / 2 &&
      Math.abs(point.y - SOURCE.y) < SOURCE.height / 2;

    expect(inside(haystack.start)).toBe(true);
    expect(inside(straight.start)).toBe(false);
  });
});

describe('the label of a relation', () => {
  it('is readable: an angle past a quarter of a turn is flipped', () => {
    expect(readableAngle(0)).toBe(0);
    expect(readableAngle(Math.PI / 4)).toBe(Math.PI / 4);
    expect(readableAngle((Math.PI * 3) / 4)).toBeCloseTo(-Math.PI / 4);
    expect(readableAngle((-Math.PI * 3) / 4)).toBeCloseTo(Math.PI / 4);
  });

  it('sits in the middle of the curve that is drawn', () => {
    for (const style of STYLES) {
      const geometry = edgeGeometry(style, SOURCE, TARGET);
      const label = geometry.label;

      // The label is between the ends of the line, not on top of a card.
      const minX = Math.min(geometry.start.x, geometry.end.x);
      const maxX = Math.max(geometry.start.x, geometry.end.x);
      const minY = Math.min(geometry.start.y, geometry.end.y);
      const maxY = Math.max(geometry.start.y, geometry.end.y);

      expect(label.x).toBeGreaterThanOrEqual(minX - 1);
      expect(label.x).toBeLessThanOrEqual(maxX + 1);
      expect(label.y).toBeGreaterThanOrEqual(minY - 1);
      expect(label.y).toBeLessThanOrEqual(maxY + 1);
      expect(Math.abs(label.angle)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });
});

describe('the dashes of the status', () => {
  it('dashes a pending relation and dots a rejected one, and keeps an active one solid', () => {
    expect(EDGE_DASH.ACTIVE).toBeUndefined();
    expect(EDGE_DASH.DRAFT).toBeUndefined();
    expect(EDGE_DASH.PENDING).toBe('6 4');
    expect(EDGE_DASH.REJECTED).toBe('1 3');
  });
});
