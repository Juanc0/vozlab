/**
 * The merge and the picture — the two pure rules of the walk.
 *
 * The walk merges what the API answers into the working set, and the
 * picture is the whole working set: everything that has been seen stays on
 * it. Both are pure: no DOM, no API call, no Cytoscape.
 */

import { describe, expect, it } from 'vitest';
import { pictureOf } from '$lib/graph/explore/neighbourhood';
import { mergeEdges, mergeNodes, sameIds } from '$lib/graph/merge';
import { EDGE, EDGE_B, EDGE_C, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

describe('the merge', () => {
  it('adds what is new and keeps what was there', () => {
    const merged = mergeNodes([NODE_A, NODE_B], [NODE_B, NODE_C]);

    expect(merged.map((node) => node.id)).toEqual([NODE_A.id, NODE_B.id, NODE_C.id]);
  });

  it('keeps the freshest version of a node', () => {
    const fresh = { ...NODE_A, title: 'A fresher title' };
    const merged = mergeNodes([NODE_A], [fresh]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe('A fresher title');
  });

  it('merges the relations the same way', () => {
    const merged = mergeEdges([EDGE], [EDGE_B]);

    expect(merged.map((edge) => edge.id)).toEqual([EDGE.id, EDGE_B.id]);
  });

  it('says whether two sets hold the same things', () => {
    expect(sameIds([NODE_A, NODE_B], [NODE_A, NODE_B])).toBe(true);
    expect(sameIds([NODE_A, NODE_B], [NODE_A, NODE_C])).toBe(false);
    expect(sameIds([NODE_A], [NODE_A, NODE_B])).toBe(false);
    expect(sameIds(null, [NODE_A])).toBe(false);
  });
});

describe('the picture of the working set', () => {
  it('holds every node of the working set', () => {
    const picture = pictureOf([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B, EDGE_C]);

    expect(picture.nodes.map((node) => node.id)).toEqual([
      NODE_A.id,
      NODE_B.id,
      NODE_C.id
    ]);
  });

  it('keeps only the relations whose two ends are inside', () => {
    const picture = pictureOf([NODE_A, NODE_B], [EDGE]);

    expect(picture.nodes.map((node) => node.id)).toEqual([NODE_A.id, NODE_B.id]);
    expect(picture.edges.map((edge) => edge.id)).toEqual([EDGE.id]);
  });

  it('drops a relation whose other end is outside', () => {
    const picture = pictureOf([NODE_A], [EDGE]);

    expect(picture.nodes.map((node) => node.id)).toEqual([NODE_A.id]);
    expect(picture.edges).toHaveLength(0);
  });
});
