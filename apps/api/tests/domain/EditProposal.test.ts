import { describe, expect, it } from 'vitest';
import { EditProposal } from '../../src/domain/entities/EditProposal.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';

const proposer = AuthorHash.fromIdentity('proposer-1', 'salt');
const moderator = AuthorHash.fromIdentity('moderator-1', 'salt');

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
});
