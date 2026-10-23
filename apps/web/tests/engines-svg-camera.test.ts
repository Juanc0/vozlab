/**
 * The **camera** of the SVG painter.
 *
 * The fit puts the whole picture in view, the wheel keeps the point under
 * the pointer under it, and the range is the range of the reader: a
 * twentieth at the bottom and three times at the top.
 */

import { describe, expect, it } from 'vitest';
import {
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
  fitTransform,
  toScreen,
  toWorld,
  zoomAt
} from '$lib/graph/svg/camera';

const VIEWPORT = { width: 800, height: 600 };

describe('the fit of the picture', () => {
  it('puts the whole picture in view, with room around it', () => {
    const transform = fitTransform(
      { minX: 0, minY: 0, maxX: 400, maxY: 200 },
      VIEWPORT
    );

    // The limiting side is the width: 800 - 2 * 30 = 740 for 400 pixels.
    expect(transform.k).toBeCloseTo((800 - FIT_PADDING * 2) / 400);
    // The picture is centred.
    expect(transform.x + 200 * transform.k).toBeCloseTo(400);
    expect(transform.y + 100 * transform.k).toBeCloseTo(300);
  });

  it('does not fit a picture below the floor of the reader', () => {
    const transform = fitTransform(
      { minX: 0, minY: 0, maxX: 100_000, maxY: 100_000 },
      VIEWPORT
    );

    expect(transform.k).toBe(MIN_ZOOM);
  });

  it('does not fit a picture above the ceiling of the reader', () => {
    const transform = fitTransform({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, VIEWPORT);

    expect(transform.k).toBe(MAX_ZOOM);
  });
});

describe('the zoom of the reader', () => {
  it('keeps the point under the pointer under it', () => {
    const before = { x: 40, y: 80, k: 1.5 };
    const point = { x: 320, y: 240 };
    const after = zoomAt(before, point, 1.4);

    // The world point under the pointer is the same one before and after.
    const worldBefore = toWorld(before, point);
    const worldAfter = toWorld(after, point);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
    expect(after.k).toBeGreaterThan(before.k);
  });

  it('does not go past the ends of the range', () => {
    expect(zoomAt({ x: 0, y: 0, k: 2.9 }, { x: 0, y: 0 }, 10).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 0.06 }, { x: 0, y: 0 }, 0.1).k).toBe(MIN_ZOOM);
  });

  it('goes from the screen to the drawing and back', () => {
    const transform = { x: 120, y: -40, k: 0.5 };
    const point = { x: 33, y: 77 };
    const screen = toScreen(transform, point);
    const world = toWorld(transform, screen);

    expect(world.x).toBeCloseTo(point.x);
    expect(world.y).toBeCloseTo(point.y);
  });
});
