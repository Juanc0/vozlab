import { describe, expect, it } from 'vitest';
import {
  mostRelatedNode,
  newestNode,
  presentedNodeId,
  relationCounts
} from '$lib/graph/explore/focus';
import { EDGE, EDGE_B, NEW_NODE, NODE_A, NODE_B, NODE_C } from './fixtures/graph';

describe('the focus of the exploration view', () => {
  it('counts the relations of every node of the window', () => {
    const counts = relationCounts([EDGE, EDGE_B]);

    expect(counts.get(NODE_A.id)).toBe(1);
    expect(counts.get(NODE_B.id)).toBe(2);
    expect(counts.get(NODE_C.id)).toBe(1);
  });

  it('presents the most recently added node of the window', () => {
    expect(newestNode([NODE_A, NODE_B])?.id).toBe(NODE_B.id);
    expect(newestNode([NODE_A, NEW_NODE])?.id).toBe(NEW_NODE.id);
  });

  it('breaks the tie of the creation order by the id, like the API does', () => {
    const twin = { ...NODE_A, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };

    expect(newestNode([NODE_A, twin])?.id).toBe(twin.id);
  });

  it('presents the node with the most relations of the window', () => {
    expect(mostRelatedNode([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B])?.id).toBe(NODE_B.id);
  });

  it('presents the newest node when no node has any relation', () => {
    expect(mostRelatedNode([NODE_A, NODE_B], [])?.id).toBe(NODE_B.id);
  });

  it('presents the newest node with the `recent` criterion', () => {
    expect(presentedNodeId([NODE_A, NEW_NODE], [EDGE], 'recent', null)).toBe(NEW_NODE.id);
  });

  it('presents the most related node with the `related` criterion', () => {
    expect(presentedNodeId([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B], 'related', null)).toBe(
      NODE_B.id
    );
  });

  it('follows the click with the `manual` criterion', () => {
    expect(presentedNodeId([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B], 'manual', NODE_C.id)).toBe(
      NODE_C.id
    );
  });

  it('presents the most related node when the `manual` criterion has no click', () => {
    expect(presentedNodeId([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B], 'manual', null)).toBe(
      NODE_B.id
    );
  });

  it('presents nothing when the window is empty', () => {
    expect(presentedNodeId([], [], 'recent', null)).toBeNull();
    expect(presentedNodeId([], [], 'manual', NODE_A.id)).toBeNull();
  });

  it('ignores a manual click that is not in the window', () => {
    expect(
      presentedNodeId([NODE_A, NODE_B, NODE_C], [EDGE, EDGE_B], 'manual', 'not-in-the-window')
    ).toBe(NODE_B.id);
  });
});
