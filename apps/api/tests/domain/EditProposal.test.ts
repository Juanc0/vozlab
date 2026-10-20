import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';
import { EditProposal } from '../../src/domain/entities/EditProposal.js';

const proposer = testHash('proposer-1');
const moderator = testHash('moderator-1');

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeProposal(overrides: Partial<{
  status: EditProposal['status'];
  communityScore: number;
  createdAt: Date;
}> = {}): EditProposal {
  return new EditProposal(
    'proposal-1',
    'ws-1',
    'node-1',
    'NODE',
    { title: 'New title' },
    proposer,
    overrides.status ?? 'PENDING',
    null,
    overrides.communityScore ?? 0,
    null,
    null,
    overrides.createdAt ?? new Date()
  );
}

describe('EditProposal', () => {
  it('approves only from PENDING', () => {
    const proposal = makeProposal();
    proposal.approve(moderator);
    expect(proposal.status).toBe('APPROVED_BY_AUTHOR');
    expect(proposal.resolvedBy).toEqual(moderator);

    expect(() => proposal.approve(moderator)).toThrowError(/ERR_INVALID_STATE_TRANSITION/);
  });

  it('rejects only from PENDING', () => {
    const proposal = makeProposal();
    proposal.reject(moderator);
    expect(proposal.status).toBe('REJECTED_BY_AUTHOR');

    expect(() => proposal.reject(moderator)).toThrowError(/ERR_INVALID_STATE_TRANSITION/);
  });

  it('auto-applies only when older than 14 days and score >= 10', () => {
    const tooYoung = makeProposal({ communityScore: 10, createdAt: daysAgo(2) });
    expect(() => tooYoung.autoApply(moderator)).toThrowError(
      expect.objectContaining({ code: 'ERR_UNMET_AUTO_APPLY_CRITERIA' })
    );

    const lowScore = makeProposal({ communityScore: 9, createdAt: daysAgo(15) });
    expect(() => lowScore.autoApply(moderator)).toThrowError(
      expect.objectContaining({ code: 'ERR_UNMET_AUTO_APPLY_CRITERIA' })
    );

    const eligible = makeProposal({ communityScore: 10, createdAt: daysAgo(15) });
    eligible.autoApply(moderator);
    expect(eligible.status).toBe('AUTO_APPLIED');
    expect(eligible.resolvedBy).toEqual(moderator);
  });

  // --- ADR-0026: the kind ---

  it('defaults to the EDIT kind', () => {
    const proposal = makeProposal();

    expect(proposal.kind).toBe('EDIT');
    expect(proposal.mergeTargetId).toBeNull();
  });

  it('exposes the surviving node of a merge proposal', () => {
    const proposal = new EditProposal(
      'proposal-2',
      'ws-1',
      'node-1',
      'NODE',
      { mergeIntoNodeId: 'node-2' },
      proposer,
      'PENDING',
      null,
      0,
      null,
      null,
      new Date(),
      'MERGE'
    );

    expect(proposal.kind).toBe('MERGE');
    expect(proposal.mergeTargetId).toBe('node-2');
  });

  it('has no surviving node when the merge payload is malformed', () => {
    const proposal = new EditProposal(
      'proposal-3',
      'ws-1',
      'node-1',
      'NODE',
      {},
      proposer,
      'PENDING',
      null,
      0,
      null,
      null,
      new Date(),
      'MERGE'
    );

    expect(proposal.mergeTargetId).toBeNull();
  });
});
