import { describe, expect, it } from 'vitest';
import {
  EXPANDED_CLASS,
  nodeCardText,
  toGraphElements,
  toNodeElement,
  type GraphNodeElement
} from '$lib/graph/elements';
import { NODE_A, NODE_B } from './fixtures/graph';

describe('the card of an expanded node', () => {
  it('carries the description and the attributes of the node', () => {
    const text = nodeCardText(NODE_A);

    expect(text).toContain(NODE_A.title);
    expect(text).toContain(NODE_A.description ?? '');
    expect(text).toContain('source');
    expect(text).toContain('runbook');
    expect(text).toContain('severity');
  });

  it('does not carry them when the node is a dot', () => {
    const element = toNodeElement(NODE_A);

    expect(element.data.label).toBe(NODE_A.title);
    expect(element.data.label).not.toContain('runbook');
    expect(element.data.expanded).toBe(false);
  });

  it('is the label of the node when it is expanded', () => {
    const element = toNodeElement(NODE_A, { expanded: true });

    expect(element.data.label).toBe(nodeCardText(NODE_A));
    expect(element.data.label).toContain(NODE_A.description ?? '');
    expect(element.classes).toContain(EXPANDED_CLASS);
  });

  it('says so when the node has no description', () => {
    const text = nodeCardText(NODE_B);

    expect(text).toContain(NODE_B.title);
    expect(text).not.toContain('undefined');
  });

  it('writes the values of the attributes that are not texts', () => {
    const text = nodeCardText({ ...NODE_A, attributes: { count: 3, done: true, tags: ['a'] } });

    expect(text).toContain('count: 3');
    expect(text).toContain('done: true');
    expect(text).toContain('tags: ["a"]');
  });
});

describe('the elements of the exploration window', () => {
  it('marks the expanded nodes and leaves the others alone', () => {
    const elements = toGraphElements([NODE_A, NODE_B], [], {
      expandedIds: new Set([NODE_B.id])
    });

    const [first, second] = elements as GraphNodeElement[];

    expect(first.data.expanded).toBe(false);
    expect(first.classes).toBeUndefined();
    expect(second.data.expanded).toBe(true);
    expect(second.classes).toContain(EXPANDED_CLASS);
  });
});
