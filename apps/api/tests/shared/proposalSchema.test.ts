import { describe, expect, it } from 'vitest';
import {
  CreateProposalSchema,
  ListProposalQuerySchema,
} from '@vozlab/shared-types';

const NODE_ID = '11111111-1111-4111-8111-111111111111';
const SURVIVOR_ID = '22222222-2222-4222-8222-222222222222';

describe('CreateProposalSchema', () => {
  it('treats a request without a kind as an EDIT proposal', () => {
    const parsed = CreateProposalSchema.safeParse({
      targetId: NODE_ID,
      targetType: 'NODE',
      proposedChanges: { title: 'A new title' },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.kind).toBe('EDIT');
  });

  it('accepts a merge proposal that names the surviving node', () => {
    const parsed = CreateProposalSchema.safeParse({
      kind: 'MERGE',
      targetId: NODE_ID,
      targetType: 'NODE',
      proposedChanges: { mergeIntoNodeId: SURVIVOR_ID },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.kind).toBe('MERGE');
    if (parsed.data.kind !== 'MERGE') return;
    expect(parsed.data.proposedChanges.mergeIntoNodeId).toBe(SURVIVOR_ID);
  });

  it('rejects a merge proposal without the surviving node', () => {
    const parsed = CreateProposalSchema.safeParse({
      kind: 'MERGE',
      targetId: NODE_ID,
      targetType: 'NODE',
      proposedChanges: {},
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a merge proposal whose surviving node is not a UUID', () => {
    const parsed = CreateProposalSchema.safeParse({
      kind: 'MERGE',
      targetId: NODE_ID,
      targetType: 'NODE',
      proposedChanges: { mergeIntoNodeId: 'not-a-uuid' },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a merge proposal that targets an edge', () => {
    const parsed = CreateProposalSchema.safeParse({
      kind: 'MERGE',
      targetId: NODE_ID,
      targetType: 'EDGE',
      proposedChanges: { mergeIntoNodeId: SURVIVOR_ID },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const parsed = CreateProposalSchema.safeParse({
      kind: 'CREATE_EDGE',
      targetId: NODE_ID,
      targetType: 'NODE',
      proposedChanges: {},
    });

    expect(parsed.success).toBe(false);
  });
});

describe('ListProposalQuerySchema', () => {
  it('accepts a kind filter', () => {
    const parsed = ListProposalQuerySchema.safeParse({ kind: 'MERGE' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.kind).toBe('MERGE');
    expect(parsed.data.limit).toBe(20);
  });

  it('rejects an unknown kind filter', () => {
    expect(ListProposalQuerySchema.safeParse({ kind: 'NOPE' }).success).toBe(false);
  });
});
