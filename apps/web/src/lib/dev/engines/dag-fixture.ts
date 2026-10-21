/**
 * The **fixture of the cycles** — a picture with cycles in it.
 *
 * The layout of `d3-dag` is built for a **DAG**: a graph with no cycles.
 * The graph of VozLab is not a DAG, and the demo of the seeded workspace
 * has ten relations that close a cycle. A measurement of a layout that
 * breaks the cycles has to be taken on a picture **with** cycles, or it
 * measures nothing.
 *
 * The fixture is **deterministic**: the same picture on every run, so two
 * measurements are comparable and the test of the module is a test of the
 * module and not of a lottery.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines
 * and to the measurements of the batch.
 */

import type { DagEdgeInput, DagNodeInput } from '$lib/graph/explore/dag-layout';

/** The picture of the fixture. */
export interface DagFixture {
  /** The nodes of the picture, with the size of their cards. */
  readonly nodes: DagNodeInput[];
  /** The relations of the picture. */
  readonly edges: DagEdgeInput[];
}

/** The width of the card of a node of the fixture, in pixels. */
export const FIXTURE_CARD_WIDTH = 140;

/**
 * The height of the card of a node of the fixture, in pixels.
 *
 * The cards are **not** all the same height: a card holds its title
 * wrapped, and the height of a card is the height of its text.
 */
export function fixtureCardHeight(index: number): number {
  return 44 + (index % 3) * 8;
}

/**
 * Builds a picture with cycles in it.
 *
 * The picture is **layered**: the nodes are in twenty layers of ten, and
 * every node is related to two nodes of the next layer — the shape of a
 * knowledge graph, where an idea comes from other ideas.
 *
 * On top of that, the picture has **relations that go backwards**: a
 * relation from a node to a node of the previous layer closes a cycle with
 * the layers, and it is the relation a layout has to break. A picture
 * without cycles measures nothing: every layout would be happy with it.
 *
 * @param count - How many nodes the picture holds.
 * @param relationCount - How many relations the picture holds.
 * @returns The picture of the fixture.
 */
export function cyclicFixture(count = 200, relationCount = 400): DagFixture {
  const nodes: DagNodeInput[] = [];
  const edges: DagEdgeInput[] = [];

  for (let index = 0; index < count; index += 1) {
    nodes.push({
      id: `fixture-${index.toString().padStart(4, '0')}`,
      width: FIXTURE_CARD_WIDTH,
      height: fixtureCardHeight(index)
    });
  }

  const idOf = (index: number): string => `fixture-${index.toString().padStart(4, '0')}`;

  const relation = (source: number, target: number): void => {
    edges.push({
      id: `fixture-relation-${edges.length.toString().padStart(4, '0')}`,
      source: idOf(source),
      target: idOf(target)
    });
  };

  const perLayer = Math.max(1, Math.floor(count / 20));

  // The relations that go backwards: they close the cycles. They come
  // first, so a small picture is not filled with the relations of the
  // layers before it has a cycle in it.
  const backwards = Math.max(1, Math.round(relationCount / 10));
  let step = 0;

  while (edges.length < backwards && count > perLayer + 1) {
    const from = perLayer + 1 + ((step * 13) % (count - perLayer - 2));

    relation(from, from - perLayer);
    step += 1;
  }

  // The layers: every node is related to two nodes of the next layer.
  for (let index = 0; index < count && edges.length < relationCount; index += 1) {
    const layer = Math.floor(index / perLayer);
    const nextLayer = layer + 1;
    const position = index % perLayer;

    if (nextLayer * perLayer >= count) {
      continue;
    }

    for (const offset of [0, 3]) {
      if (edges.length >= relationCount) {
        break;
      }

      relation(index, nextLayer * perLayer + ((position + offset) % perLayer));
    }
  }

  return { nodes, edges };
}
