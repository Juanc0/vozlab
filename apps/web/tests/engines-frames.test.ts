/**
 * The **frame time** of the comparison.
 *
 * The measurement asks the picture to move with a wheel and records the
 * time between the frames. The SVG painter says which surface is its own
 * (`[data-engine-picture="svg"]`); the incumbent says nothing and is still
 * measured through its `<canvas>`.
 */

import { describe, expect, it, vi } from 'vitest';
import { measureFrames, summarizeFrames } from '$lib/dev/engines/frames';

describe('the measurement of the frames', () => {
  it('measures the SVG painter through its own surface', async () => {
    const container = document.createElement('div');
    const svg = document.createElement('div');
    const canvas = document.createElement('canvas');

    svg.dataset.enginePicture = 'svg';
    container.append(svg, canvas);

    const painted = vi.fn();
    const incumbent = vi.fn();

    svg.addEventListener('wheel', painted);
    canvas.addEventListener('wheel', incumbent);

    const deltas = await measureFrames(container, 4);

    expect(deltas).toHaveLength(4);
    expect(deltas.every((delta) => Number.isFinite(delta) && delta >= 0)).toBe(true);

    // The wheel went to the painter and never to the canvas: the numbers
    // belong to the engine under test.
    expect(painted).toHaveBeenCalled();
    expect(incumbent).not.toHaveBeenCalled();
  });

  it('falls back to the canvas of the incumbent', async () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');

    container.append(canvas);

    const incumbent = vi.fn();

    canvas.addEventListener('wheel', incumbent);

    const deltas = await measureFrames(container, 3);

    expect(deltas).toHaveLength(3);
    expect(incumbent).toHaveBeenCalled();
  });

  it('returns no frames when there is no picture', async () => {
    const container = document.createElement('div');

    await expect(measureFrames(container, 3)).resolves.toEqual([]);
  });
});

describe('the summary of the frames', () => {
  it('reports the median, the mean and the extremes', () => {
    expect(summarizeFrames([16, 20, 12, 18])).toEqual({
      frames: 4,
      mean: 16.5,
      median: 17,
      max: 20,
      min: 12
    });
  });

  it('reports an empty measurement as zeroes', () => {
    expect(summarizeFrames([])).toEqual({
      frames: 0,
      mean: 0,
      median: 0,
      max: 0,
      min: 0
    });
  });
});
