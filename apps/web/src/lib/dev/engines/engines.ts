/**
 * The **engines** of the comparison.
 *
 * The comparison is a **playground**: one space, one engine at a time. The
 * engines are the **tabs** of that space, and this module is the list of
 * them — their name, their note, the layout they accept and the findings
 * that concern them.
 *
 * The list is **pure data**: the tabs, the panel that mounts an engine and
 * the readout of its measurements all read it, and they must never
 * disagree about what an engine is.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

import type { GraphLayout } from '$lib/graph/explore/layout';
import type { TranslationKey } from '$lib/i18n';

/** The engines of the comparison. */
export type EngineId = 'dagre' | 'd3' | 'dag';

/**
 * What a **measurement** of an engine says.
 *
 * It is the union of what the engines report: the layouts of Cytoscape
 * report the time they took, whether they settled, the pairs of cards that
 * lie on top of each other and the relations they had to break. The living
 * spring adds what makes it different: it is **alive**, it wakes, and it
 * reaches its shape below a threshold of movement.
 *
 * The report is **attributed to the engine that produced it** — never to
 * the engine that was on screen when it arrived.
 */
export interface EngineMeasurement {
  /** The time the arrangement took, in milliseconds. */
  readonly ms: number;
  /** Whether the picture came to rest. */
  readonly settled: boolean;
  /** The pairs of cards that lie on top of each other. */
  readonly overlaps?: number;
  /** The steps of the simulation. */
  readonly ticks?: number;
  /** The time a frame of the arrangement took, in milliseconds. */
  readonly frameMs?: number;
  /** The time a tick of the spring took, in milliseconds. */
  readonly tickMs?: number;
  /** Whether the spring breathes instead of stopping. */
  readonly alive?: boolean;
  /** Whether the living spring is awake. */
  readonly awake?: boolean;
  /** Whether the picture reached its shape below the threshold. */
  readonly shapeReached?: boolean;
  /** The movement below which the picture is said to have its shape. */
  readonly threshold?: number;
  /** The relations the arrangement had to break to order the graph. */
  readonly reversedRelations?: readonly string[];
}

/** What an engine of the comparison is. */
export interface EngineDescriptor {
  /** The id of the engine. */
  readonly id: EngineId;
  /** The name of the engine, in the dictionary. */
  readonly nameKey: TranslationKey;
  /** The note of the engine — what it brings of its own. */
  readonly noteKey: TranslationKey;
  /** Whether the same picture comes out twice. */
  readonly reproducibleKey: TranslationKey;
  /**
   * The layout the engine arranges the picture with.
   *
   * Every engine of the comparison uses the canvas of Cytoscape: the
   * comparison no longer carries a second painter.
   */
  readonly layout: GraphLayout;
  /** The findings of the comparison that concern this engine. */
  readonly findingKeys: readonly TranslationKey[];
}

/**
 * The engines of the comparison, in the order the tabs show them.
 *
 * The order is the order of the **freedom**: the deterministic arrangement
 * first, then the living spring, then the clone of `dagre`.
 */
export const ENGINES: readonly EngineDescriptor[] = [
  {
    id: 'dagre',
    nameKey: 'engines.panelDagreName',
    noteKey: 'engines.panelDagreNote',
    reproducibleKey: 'engines.reproducibleDagre',
    layout: 'dagre',
    findingKeys: ['engines.findingDagCycles']
  },
  {
    id: 'd3',
    nameKey: 'engines.panelD3Name',
    noteKey: 'engines.panelD3Note',
    reproducibleKey: 'engines.reproducibleD3',
    layout: 'd3',
    findingKeys: [
      'engines.findingD3Collision',
      'engines.findingD3Seed',
      'engines.findingD3Living'
    ]
  },
  {
    id: 'dag',
    nameKey: 'engines.panelDagName',
    noteKey: 'engines.panelDagNote',
    reproducibleKey: 'engines.reproducibleDag',
    layout: 'dag',
    findingKeys: ['engines.findingDagCycles', 'engines.findingDagQuality']
  }
];

/**
 * The descriptor of an engine.
 *
 * @param id - The id of the engine.
 * @returns The descriptor of the engine.
 */
export function engineDescriptor(id: EngineId): EngineDescriptor {
  const found = ENGINES.find((engine) => engine.id === id);

  if (found === undefined) {
    throw new Error(`[vozlab/web] The engine "${id}" is not one of the comparison.`);
  }

  return found;
}
