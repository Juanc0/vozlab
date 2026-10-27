import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';

import { AutoApplyProposalUseCase } from '../../src/application/use_cases/AutoApplyProposalUseCase.js';
import { EditProposal } from '../../src/domain/entities/EditProposal.js';
import type { WorkspaceRole } from '../../src/domain/ports/IMembershipRepository.js';
import type { IProposalRepository } from '../../src/domain/ports/IProposalRepository.js';
import {
  makeEdgeRepository,
  makeEventPublisher,
  makeNodeRepository,
  makeOntologyRepository,
  makeUnitOfWork,
} from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const proposerHash = testHash('proposer-1');

function proposal(workspaceId: string, overrides: Partial<{ status: string; score: number }> = {}): EditProposal {
  return new EditProposal(
    'proposal-1',
    workspaceId,
    'node-1',
    'NODE',
    { title: 'x' },
    proposerHash,
    'PENDING',
    null,
    overrides.score ?? 0
  );
}

function makeProposalRepo(existing: EditProposal | null): IProposalRepository {
  return {
    async findById() {
      return existing;
    },
    async findByIdInWorkspace() {
      return existing;
    },
    async listByWorkspace() {
      return { items: [], nextCursor: null };
    },
    async findPendingByTarget() {
      return [];
    },
    async save() {},
    async updateStatus() {},
  };
}

function build(existing: EditProposal | null, role: WorkspaceRole | null) {
  const proposalRepo = makeProposalRepo(existing);
  const nodeRepo = makeNodeRepository();
  const edgeRepo = makeEdgeRepository();
  const ontologyRepo = makeOntologyRepository();
  const membershipRepo = {
    async isMember() {
      return role !== null;
    },
    async getRole() {
      return role;
    },
    async add() {},
    async changeRole() {},
    async suspend() {},
    async reactivate() {},
    async remove() {},
  };
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();

  const useCase = new AutoApplyProposalUseCase(
    nodeRepo.repo,
    edgeRepo.repo,
    ontologyRepo.repo,
    proposalRepo,
    membershipRepo,
    uow,
    publisher
  );
  return { useCase, nodeRepo, edgeRepo, ontologyRepo, events, ran };
}

const input = {
  proposalId: 'proposal-1',
  resolverUserId: 'user-1',
  resolverHash: testHash('moderator-1').toString(),
  workspaceId: WS,
  tid,
};

describe('AutoApplyProposalUseCase', () => {
  it('rejects a MEMBER before touching the target (ERR_AUTHORIZATION_FAILED)', async () => {
    const { useCase, nodeRepo, ontologyRepo, ran } = build(proposal(WS), 'MEMBER');

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(nodeRepo.appliedDeltas).toEqual([]);
    expect(ontologyRepo.deltasApplied).toEqual([]);
    expect(ran.count).toBe(0);
  });

  it('rejects a null role with ERR_AUTHORIZATION_FAILED', async () => {
    const { useCase } = build(proposal(WS), null);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
  });

  it('reports a foreign-workspace proposal as ERR_PROPOSAL_NOT_FOUND even for ADMIN', async () => {
    const { useCase, nodeRepo, ran } = build(proposal('ws-other'), 'ADMIN');

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'ERR_PROPOSAL_NOT_FOUND' });
    expect(nodeRepo.appliedDeltas).toEqual([]);
    expect(ran.count).toBe(0);
  });

  it('rejects a MODERATOR when the domain criteria are unmet (ERR_UNMET_AUTO_APPLY_CRITERIA)', async () => {
    const { useCase, nodeRepo, ran, events } = build(proposal(WS, { score: 0 }), 'MODERATOR');

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_UNMET_AUTO_APPLY_CRITERIA',
    });
    expect(nodeRepo.appliedDeltas).toEqual([]);
    expect(ran.count).toBe(0);
    expect(events).toEqual([]);
  });
});
