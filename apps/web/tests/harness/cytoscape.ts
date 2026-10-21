/**
 * A fake Cytoscape core, for the tests of the canvas.
 *
 * Cytoscape draws to a `<canvas>`, which jsdom does not provide: the
 * module is mocked and the core is faked. The fake is **complete enough**
 * for the exploration instance — it holds the nodes and the relations, it
 * runs the layout, it centres the picture and it calls the handlers the
 * instance registered.
 *
 * The point of the tests is the **behaviour** of the view — what it asks
 * for, what it draws and where it centres — not the drawing itself.
 */

import { vi } from 'vitest';

export interface FakeNode {
  kind: 'node';
  id: string;
  data: Record<string, unknown>;
  classes: Set<string>;
  style: Record<string, unknown>;
  position: { x: number; y: number };
  api: Record<string, unknown>;
}

export interface FakeEdge {
  kind: 'edge';
  id: string;
  data: Record<string, unknown>;
  classes: Set<string>;
  style: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  api: Record<string, unknown>;
}

export interface Handler {
  event: string;
  selector: string | null;
  handler: (event: unknown) => void;
}

export interface FakeCore {
  core: Record<string, unknown>;
  handlers: Handler[];
  layouts: Array<Record<string, unknown>>;
  /**
   * The places the picture was put in.
   *
   * The **spring** of the exploration view does not ask Cytoscape for a
   * layout: it answers with the places itself and puts them in the cards.
   * Every write is recorded here, so a test can see that the picture was
   * arranged again.
   */
  placements: Array<{ id: string; position: { x: number; y: number } }>;
  nodes: Map<string, FakeNode>;
  edges: Map<string, FakeEdge>;
}

export function createFakeCore(): FakeCore {
  const nodes = new Map<string, FakeNode>();
  const edges = new Map<string, FakeEdge>();
  const handlers: Handler[] = [];
  const layouts: Array<Record<string, unknown>> = [];
  const placements: Array<{ id: string; position: { x: number; y: number } }> = [];
  let placed = 0;

  const nodeApi = (node: FakeNode) => ({
    id: () => node.id,
    data: (key: string) => node.data[key],
    // The text of a card is a child of the card: it hangs under it.
    isChild: () => node.data['parent'] !== undefined,
    parent: () => {
      const parentId = node.data['parent'];

      if (typeof parentId !== 'string') {
        return collection([]);
      }

      const parent = nodes.get(parentId);

      return parent === undefined ? collection([]) : collection([parent]);
    },
    hasClass: (name: string) => node.classes.has(name),
    // The text of a card is not a thing the user can move.
    ungrabify: vi.fn(),
    // The position can be read and written: the instance puts the places
    // the user dragged back after the layout.
    position: (next?: { x: number; y: number }) => {
      if (next !== undefined) {
        node.position = next;
        placements.push({ id: node.id, position: next });
      }

      return node.position;
    },
    outerWidth: () => 40,
    outerHeight: () => 40,
    renderedPosition: () => ({ x: 30, y: 40 }),
    renderedWidth: () => 40,
    renderedHeight: () => 40,
    style: (properties: Record<string, unknown>) => {
      Object.assign(node.style, properties);
    },
    addClass: (name: string) => {
      node.classes.add(name);
    },
    removeClass: (name: string) => {
      node.classes.delete(name);
    }
  });

  const edgeApi = (edge: FakeEdge) => ({
    id: () => edge.id,
    source: () => (nodes.get(edge.sourceId) as FakeNode).api,
    target: () => (nodes.get(edge.targetId) as FakeNode).api,
    // The middle of the line: the badge of a relation is placed on it.
    renderedMidpoint: () => ({ x: 30, y: 40 }),
    style: (properties: Record<string, unknown>) => {
      Object.assign(edge.style, properties);
    },
    addClass: (name: string) => {
      edge.classes.add(name);
    },
    removeClass: (name: string) => {
      edge.classes.delete(name);
    }
  });

  const collection = (items: Array<FakeNode | FakeEdge>) => ({
    get length() {
      return items.length;
    },
    items,
    forEach: (fn: (item: unknown) => void) => {
      items.forEach((item) => fn(item.api));
    },
    map: (fn: (item: unknown) => unknown) => items.map((item) => fn(item.api)),
    // The collection knows the nodes it holds and can be narrowed: the
    // layout arranges the cards, not the text that hangs under them.
    nodes: () => collection(items.filter((item) => item.kind === 'node')),
    filter: (fn: (item: unknown) => boolean) => collection(items.filter((item) => fn(item.api))),
    union: (other: { items: Array<FakeNode | FakeEdge> }) =>
      collection([...items, ...other.items]),
    remove: () => {
      for (const item of items) {
        if (item.kind === 'node') {
          nodes.delete(item.id);
        } else {
          edges.delete(item.id);
        }
      }
    },
    removeClass: (name: string) => {
      items.forEach((item) => item.classes.delete(name));
    },
    addClass: (name: string) => {
      items.forEach((item) => item.classes.add(name));
    }
  });

  const core = {
    on: (
      event: string,
      selector: string | ((event: unknown) => void) | undefined,
      handler?: (event: unknown) => void
    ) => {
      handlers.push({
        event,
        selector: typeof selector === 'string' ? selector : null,
        handler: handler ?? (selector as (event: unknown) => void)
      });
    },
    elements: () => collection([...nodes.values(), ...edges.values()]),
    add: (
      added: Array<{
        group: string;
        data: { id: string; source?: string; target?: string };
        classes?: string[];
      }>
    ) => {
      for (const element of added) {
        if (element.group === 'nodes') {
          const node: FakeNode = {
            kind: 'node',
            id: element.data.id,
            data: element.data,
            classes: new Set(element.classes ?? []),
            style: {},
            // The nodes are spread over the picture: the mock has to draw a
            // graph whose nodes are not on top of each other.
            position: { x: (placed % 5) * 160, y: Math.floor(placed / 5) * 140 },
            api: {}
          };
          placed += 1;
          node.api = nodeApi(node);
          nodes.set(element.data.id, node);
        } else {
          const edge: FakeEdge = {
            kind: 'edge',
            id: element.data.id,
            data: element.data,
            classes: new Set(),
            style: {},
            sourceId: element.data.source ?? '',
            targetId: element.data.target ?? '',
            api: {}
          };
          edge.api = edgeApi(edge);
          edges.set(element.data.id, edge);
        }
      }
    },
    layout: (options: Record<string, unknown>) => {
      layouts.push(options);
      // The layout is an emitter: the instance listens to `layoutstop` to
      // report how long the layout took.
      return { run: () => undefined, one: vi.fn() };
    },
    nodes: () => collection([...nodes.values()]),
    edges: () => collection([...edges.values()]),
    getElementById: (id: string) => {
      const node = nodes.get(id);

      if (node === undefined) {
        return { length: 0, addClass: () => undefined };
      }

      return { length: 1, ...nodeApi(node) };
    },
    center: vi.fn(),
    fit: vi.fn(),
    zoom: vi.fn(() => 1),
    destroy: vi.fn()
  };

  return { core, handlers, layouts, placements, nodes, edges };
}

/** Fires the handler the instance registered for an event. */
export function fire(
  handlers: Handler[],
  event: string,
  selector: string | null,
  payload: unknown
): void {
  const call = handlers.find(
    (entry) => entry.event === event && (selector === null || entry.selector === selector)
  );

  if (call === undefined) {
    throw new Error(`the canvas did not register a handler for ${event}`);
  }

  call.handler(payload);
}

/**
 * The target of a tap on a node of the picture.
 *
 * The card of a node is a node of Cytoscape with the id of the node it
 * holds: a tap on it is a tap on the node of the window.
 */
export function nodeTarget(id: string): {
  target: { id: () => string; isChild: () => boolean; data: () => undefined };
} {
  return {
    target: { id: () => id, isChild: () => false, data: () => undefined }
  };
}
