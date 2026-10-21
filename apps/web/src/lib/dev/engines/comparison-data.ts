/**
 * The **data** of the comparison of the engines.
 *
 * The three panels must show the **same** picture: the same nodes, the same
 * relations, the same ids. The data of the comparison is therefore built
 * **once**, here, and handed to the three panels as it is.
 *
 * There are two sizes:
 *
 * - the **demo**: the window of the workspace, the twenty-four nodes and
 *   the thirty-five relations of the seed;
 * - the **stress**: the demo plus enough synthetic nodes to reach the
 *   ceiling of the API (two hundred), so the frame time of the three
 *   engines can be measured with the number of cards the app has to draw
 *   in the worst case.
 *
 * The synthetic nodes are **deterministic**: the same comparison always
 * shows the same picture, and the two engines are compared on the same
 * graph.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** The picture the three panels draw. */
export interface ComparisonGraph {
  /** The nodes of the picture. */
  readonly nodes: NodeDto[];
  /** The relations of the picture. */
  readonly edges: SubgraphEdgeDto[];
}

/** The ceiling of the API: the number of nodes a window may hold. */
export const MAX_NODES = 200;

/** The words the synthetic titles are built from. */
const SUBJECTS = [
  'El|Exterior',
  'plataforma|elevada',
  'parking|disuasorio',
  'transbordo|peatonal',
  'carril|bicicicleta',
  'semáforo|adaptativo',
  'aparcamiento|residencial',
  'plaza|peatonal',
  'biblioteca|polivalente',
  'laboratorio|universitario'
] as const;

/** The classes the synthetic nodes take. */
const TYPES = [
  { key: 'Problem', es: 'Problema', en: 'Problem' },
  { key: 'Idea', es: 'Idea', en: 'Idea' },
  { key: 'Resource', es: 'Recurso', en: 'Resource' }
] as const;

/** The relations the synthetic edges take. */
const RELATIONS = [
  { key: 'RELATES_TO', es: 'se relaciona con', en: 'relates to' },
  { key: 'INVOLVES', es: 'involucra', en: 'involves' },
  { key: 'ADDRESSES', es: 'atiende', en: 'addresses' },
  { key: 'BUILDS_ON', es: 'se apoya en', en: 'builds on' },
  { key: 'EVIDENCED_BY', es: 'está respaldado por', en: 'is evidenced by' }
] as const;

/**
 * A deterministic uuid for a synthetic node.
 *
 * The ids of the comparison have to be **stable**: the three panels are
 * compared on the same ids, and the picture of the comparison is the same
 * every time it is opened.
 */
function syntheticId(index: number): string {
  const hex = index.toString(16).padStart(12, '0');

  return `c0mp0000-0000-4000-8000-${hex}`;
}

/**
 * The title of a synthetic node.
 *
 * Some of the titles carry a **long word** — `Estacionamiento` — on
 * purpose: the card of a node grows for a word it cannot break, and the
 * comparison has to show that both engines grow it the same way.
 */
export function syntheticTitle(index: number): string {
  const [subject, detail] = SUBJECTS[index % SUBJECTS.length].split('|');
  const group = Math.floor(index / SUBJECTS.length) + 1;

  if (index % 17 === 0) {
    return `Estacionamiento de ${subject.toLowerCase()} ${detail.toLowerCase()} ${group}`;
  }

  if (index % 11 === 0) {
    return `${subject} ${detail} en el barrio ${group}`;
  }

  return `${subject} ${detail} ${group}`;
}

/**
 * Builds the synthetic nodes and relations of a graph.
 *
 * The synthetic nodes hang from the real ones: every synthetic node is
 * related to a real node and to the synthetic node before it, so the
 * picture is a graph and not a cloud of isolated points.
 *
 * @param count - How many synthetic nodes to build.
 * @param real - The real nodes of the demo, the anchors of the synthetic ones.
 * @returns The synthetic nodes and the synthetic relations.
 */
export function syntheticNodes(
  count: number,
  real: readonly NodeDto[]
): { nodes: NodeDto[]; edges: SubgraphEdgeDto[] } {
  const nodes: NodeDto[] = [];
  const edges: SubgraphEdgeDto[] = [];
  const anchors = real.length > 0 ? real : [];

  for (let index = 0; index < count; index += 1) {
    const type = TYPES[index % TYPES.length];
    const id = syntheticId(index);

    nodes.push({
      id,
      workspaceId: '00000000-0000-0000-0000-000000000000',
      typeKey: type.key,
      typeDisplayNames: { es: type.es, en: type.en },
      title: syntheticTitle(index),
      description: null,
      attributes: {},
      authorHash: 'comparison',
      status: 'ACTIVE',
      communityScore: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    const previous = index === 0 ? null : nodes[index - 1];
    const anchor = anchors[index % Math.max(1, anchors.length)] ?? null;

    if (previous !== null) {
      edges.push(syntheticEdge(edges.length, previous.id, id));
    }

    if (anchor !== null && anchor.id !== id) {
      edges.push(syntheticEdge(edges.length, anchor.id, id));
    }
  }

  return { nodes, edges };
}

/** A synthetic relation between two nodes. */
function syntheticEdge(index: number, sourceNodeId: string, targetNodeId: string): SubgraphEdgeDto {
  const relation = RELATIONS[index % RELATIONS.length];

  return {
    id: `c0mpedge-${index.toString(16).padStart(8, '0')}`,
    sourceNodeId,
    targetNodeId,
    relationKey: relation.key,
    relationDisplayNames: { es: relation.es, en: relation.en },
    attributes: {},
    authorHash: 'comparison',
    status: 'ACTIVE',
    communityScore: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

/**
 * Builds the picture of the comparison: the demo plus the synthetic nodes
 * that are missing to reach the wanted number.
 *
 * @param demo - The window of the workspace.
 * @param wanted - How many nodes the picture must hold.
 * @returns The picture of the comparison.
 */
export function comparisonGraph(demo: ComparisonGraph, wanted: number): ComparisonGraph {
  const missing = Math.max(0, wanted - demo.nodes.length);

  if (missing === 0) {
    return { nodes: [...demo.nodes], edges: [...demo.edges] };
  }

  const synthetic = syntheticNodes(missing, demo.nodes);

  return {
    nodes: [...demo.nodes, ...synthetic.nodes],
    edges: [...demo.edges, ...synthetic.edges]
  };
}

/**
 * The ids of the nodes of a picture.
 *
 * The comparison asserts that the three panels get the same ids: the
 * panels are given the same picture, and this is how the test says it.
 */
export function nodeIds(graph: ComparisonGraph): string[] {
  return graph.nodes.map((node) => node.id);
}

/**
 * The ids of the relations of a picture.
 *
 * @param graph - The picture.
 * @returns The ids of the relations.
 */
export function edgeIds(graph: ComparisonGraph): string[] {
  return graph.edges.map((edge) => edge.id);
}
