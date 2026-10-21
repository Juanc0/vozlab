/**
 * The **weight** of the enriched relation.
 *
 * The window answers up to two hundred relations, and every one of them now
 * carries its attributes, the pseudonym of its author and the instant it was
 * created. This test measures what that costs, so the decision is a number
 * and not an opinion.
 *
 * The measurement is made on the **shape** of the answer: the same window
 * with the three fields and without them. The difference is the price of the
 * enrichment.
 */

import { describe, expect, it } from 'vitest';
import type { SubgraphEdgeDto } from '$lib/api/types';

/** The number of relations of the biggest window the API answers. */
const WINDOW = 200;

/**
 * A relation of the seeded demo: the attributes of a relation of the demo
 * are empty, and the pseudonym is a real one — sixty-four characters.
 */
function demoRelation(index: number): SubgraphEdgeDto {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-${index.toString().padStart(12, '0')}`,
    sourceNodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    targetNodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    relationKey: 'RELATES_TO',
    relationDisplayNames: { en: 'Relates to', es: 'Se relaciona con' },
    attributes: {},
    authorHash: 'a'.repeat(64),
    status: 'ACTIVE',
    communityScore: 3,
    createdAt: '2026-10-19T10:10:00.000Z'
  };
}

/**
 * A relation with the attributes of a relation that carries content: the
 * shape the ontology declares (a sector and a scope), plus a number.
 */
function richRelation(index: number): SubgraphEdgeDto {
  return {
    ...demoRelation(index),
    attributes: { sector: 'Transporte', alcance: 'Campus', peso: 3 }
  };
}

/** The size of a JSON answer, in bytes. */
function sizeOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** The answer of the window **without** the three new fields. */
function withoutContent(edges: SubgraphEdgeDto[]): unknown {
  return edges.map((edge) => {
    const { attributes, authorHash, createdAt, ...rest } = edge;

    void attributes;
    void authorHash;
    void createdAt;

    return rest;
  });
}

describe('the weight of the enriched relation', () => {
  it('costs a fixed amount per relation when the relation has no attributes', () => {
    const edges = Array.from({ length: WINDOW }, (_, index) => demoRelation(index));

    const before = sizeOf(withoutContent(edges));
    const after = sizeOf(edges);
    const growth = after - before;

    // The three fields of a relation of the demo: an empty object of
    // attributes, a pseudonym of sixty-four characters and an instant.
    const perRelation = growth / WINDOW;

    // eslint-disable-next-line no-console
    console.log(
      `the window of ${WINDOW} relations of the demo: ${before} B → ${after} B ` +
        `(+${growth} B, ${perRelation.toFixed(0)} B per relation)`
    );

    // The pseudonym and the instant are the price of the enrichment: about a
    // hundred and twenty bytes per relation, and nothing that grows with
    // the content of the relation.
    expect(perRelation).toBeGreaterThan(80);
    expect(perRelation).toBeLessThan(200);
  });

  it('costs the size of the attributes when the relation carries content', () => {
    const edges = Array.from({ length: WINDOW }, (_, index) => richRelation(index));

    const before = sizeOf(withoutContent(edges));
    const after = sizeOf(edges);
    const growth = after - before;

    // eslint-disable-next-line no-console
    console.log(
      `the window of ${WINDOW} relations with attributes: ${before} B → ${after} B ` +
        `(+${growth} B, ${(growth / WINDOW).toFixed(0)} B per relation)`
    );

    // The attributes are the JSONB of the relation: the window pays for
    // what the relations carry, and the ceiling of the window (two hundred
    // relations) is the ceiling of the cost.
    expect(growth / WINDOW).toBeLessThan(300);
  });

  it('is bounded by the ceiling of the window', () => {
    const edges = Array.from({ length: WINDOW }, (_, index) => richRelation(index));

    // The biggest answer the API can give for the relations of a window is
    // a few dozen kilobytes: it is a JSON answer the browser reads at once.
    expect(sizeOf(edges)).toBeLessThan(128 * 1024);
  });
});
