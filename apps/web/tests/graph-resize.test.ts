/**
 * The canvas follows the window.
 *
 * Cytoscape draws to a `<canvas>`: it knows the size of its container only
 * when it is told. A window that is resized, a panel that opens, a keyboard
 * that comes up on a phone — the picture stays at the old size and part of
 * it is cut off.
 *
 * The tests drive the runtime module directly: the point is the **lifecycle**
 * of the observation, not the drawing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cytoscape needs a `<canvas>`, which jsdom does not provide. The module is
 * mocked instead.
 */
const { cytoscapeMock } = vi.hoisted(() => {
  const factory = vi.fn();
  return { cytoscapeMock: Object.assign(factory, { use: vi.fn() }) };
});

vi.mock('cytoscape', () => ({ default: cytoscapeMock }));

interface FakeCore {
  on: ReturnType<typeof vi.fn>;
  elements: ReturnType<typeof vi.fn>;
  edges: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  layout: ReturnType<typeof vi.fn>;
  nodes: ReturnType<typeof vi.fn>;
  getElementById: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  fit: ReturnType<typeof vi.fn>;
  zoom: ReturnType<typeof vi.fn>;
  center: ReturnType<typeof vi.fn>;
}

function createFakeCore(): FakeCore {
  const collection = () => ({
    length: 0,
    addClass: vi.fn(),
    removeClass: vi.fn(),
    remove: vi.fn(),
    forEach: vi.fn()
  });

  return {
    on: vi.fn(),
    elements: vi.fn(() => collection()),
    edges: vi.fn(() => collection()),
    add: vi.fn(),
    layout: vi.fn(() => ({ run: vi.fn() })),
    nodes: vi.fn(() => collection()),
    getElementById: vi.fn(() => collection()),
    destroy: vi.fn(),
    resize: vi.fn(),
    fit: vi.fn(),
    zoom: vi.fn(() => 1),
    center: vi.fn()
  };
}

/**
 * The observer of the size, as the browser has it.
 *
 * jsdom has no `ResizeObserver`: the tests install one that they can fire
 * by hand, as a resize of the window would.
 */
class FakeResizeObserver {
  /** Every observer that was created. */
  static instances: FakeResizeObserver[] = [];

  readonly callback: ResizeObserverCallback;

  /** The elements the observer watches. */
  readonly observed: Element[] = [];

  /** `true` once the observer was disconnected. */
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  /** Makes the observer fire, as a resize of the window does. */
  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** The container the canvas is drawn in. */
function container(): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
}

describe('the canvas follows the size of its container', () => {
  let core: FakeCore;

  beforeEach(() => {
    core = createFakeCore();
    cytoscapeMock.mockReset();
    cytoscapeMock.use.mockReset();
    cytoscapeMock.mockReturnValue(core);
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redraws the picture when the container is resized', async () => {
    const { createGraphInstance } = await import('$lib/graph/cytoscape');
    const element = container();

    createGraphInstance({ container: element, onselect: () => {} });

    const observer = FakeResizeObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer?.observed).toContain(element);

    observer?.fire();

    // The picture is redrawn at the new size.
    expect(core.resize).toHaveBeenCalledTimes(1);
  });

  it('does not re-fit the viewport and does not run the layout again', async () => {
    const { createGraphInstance } = await import('$lib/graph/cytoscape');

    createGraphInstance({ container: container(), onselect: () => {} });

    FakeResizeObserver.instances[0]?.fire();

    // A resize that re-fits moves the graph under the reader's feet, and a
    // layout that runs again moves the nodes: the picture has to stay where
    // the user left it.
    expect(core.fit).not.toHaveBeenCalled();
    expect(core.layout).not.toHaveBeenCalled();
    expect(cytoscapeMock).toHaveBeenCalledTimes(1);
  });

  it('disconnects the observer when the instance is destroyed', async () => {
    const { createGraphInstance } = await import('$lib/graph/cytoscape');

    const instance = createGraphInstance({ container: container(), onselect: () => {} });
    const observer = FakeResizeObserver.instances[0];

    instance.destroy();

    expect(observer?.disconnected).toBe(true);
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it('redraws the exploration window too, and stops with the instance', async () => {
    const { createExplorationInstance } = await import('$lib/graph/explore/instance');

    const instance = createExplorationInstance({
      container: container(),
      onselect: () => {},
      onselectedge: () => {},
      onpreview: () => {},
      ondrag: () => {},
      onrender: () => {}
    });

    const observer = FakeResizeObserver.instances[0];
    observer?.fire();

    expect(core.resize).toHaveBeenCalledTimes(1);
    expect(core.fit).not.toHaveBeenCalled();
    expect(core.layout).not.toHaveBeenCalled();

    instance.destroy();

    expect(observer?.disconnected).toBe(true);
  });
});
