/**
 * A force layout **settles and stops**.
 *
 * The spring of the comparison is a simulation: it moves the picture until
 * the nodes find their place, and then it must stop. A simulation that
 * never stops burns the battery of the reader and never lets the picture
 * rest.
 *
 * The rule is shared by the two springs — the force layout of Cytoscape and
 * the ForceAtlas2 of Graphology — and it is the same watcher: the picture
 * has settled when it stops moving, and the watcher stops the simulation.
 */

import { describe, expect, it, vi } from 'vitest';
import { createSettleWatcher } from '$lib/dev/engines/settle';
import { greatestMovement, readPositions } from '$lib/dev/engines/spring';

describe('the settle of a force layout', () => {
  it('stops the simulation when the picture stops moving', () => {
    const stop = vi.fn();
    const watcher = createSettleWatcher({ stop, quietSteps: 2, threshold: 1.5 });

    // The picture moves: it has not settled.
    expect(watcher.step(40)).toBe(false);
    expect(watcher.step(12)).toBe(false);
    expect(stop).not.toHaveBeenCalled();

    // The picture comes to rest.
    expect(watcher.step(0.2)).toBe(false);
    expect(watcher.step(0.1)).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(watcher.settled).toBe(true);
  });

  it('does not stop the simulation while the picture still moves', () => {
    const stop = vi.fn();
    const watcher = createSettleWatcher({ stop, quietSteps: 3, threshold: 1.5 });

    watcher.step(0.1);
    watcher.step(30);
    watcher.step(0.1);
    watcher.step(0.1);

    expect(stop).not.toHaveBeenCalled();
    expect(watcher.settled).toBe(false);
  });

  it('stops the simulation only once', () => {
    const stop = vi.fn();
    const watcher = createSettleWatcher({ stop, quietSteps: 1, threshold: 1.5 });

    watcher.step(0);
    watcher.step(0);
    watcher.step(0);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops the simulation when the reader walks away', () => {
    const stop = vi.fn();
    const watcher = createSettleWatcher({ stop });

    watcher.stop();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(watcher.settled).toBe(true);
  });
});

describe('the movement of the picture', () => {
  it('is the greatest distance a node travelled', () => {
    const before = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 0 }]
    ]);
    const after = new Map([
      ['a', { x: 3, y: 4 }],
      ['b', { x: 10, y: 0 }]
    ]);

    expect(greatestMovement(before, after)).toBe(5);
  });

  it('is zero when the picture does not move', () => {
    const before = new Map([['a', { x: 1, y: 2 }]]);
    const after = new Map([['a', { x: 1, y: 2 }]]);

    expect(greatestMovement(before, after)).toBe(0);
  });
});

describe('the places of the picture', () => {
  it('are read from the graph', () => {
    const graph = {
      forEachNode: (callback: (node: string, attributes: Record<string, unknown>) => void) => {
        callback('a', { x: 1, y: 2 });
        callback('b', { x: 3, y: 4 });
      }
    };

    const positions = readPositions(graph as never);

    expect(positions.get('a')).toEqual({ x: 1, y: 2 });
    expect(positions.get('b')).toEqual({ x: 3, y: 4 });
  });
});
