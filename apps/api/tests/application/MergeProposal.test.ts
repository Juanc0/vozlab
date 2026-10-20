import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';

import { ApproveProposalUseCase } from '../../src/application/use_cases/ApproveProposalUseCase.js';
import { CreateProposalUseCase } from '../../src/application/use_cases/CreateProposalUseCase.js';
import { EditProposal } from '../../src/domain/entities/EditProposal.js';
import { Node } from '../../src/domain/entities/Node.js';
import type { IProposalRepository } from '../../src/domain/ports/IProposalRepository.js';
import type { IInteractionRepository } from '../../src/domain/ports/IInteractionRepository.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import {
  makeEdgeRepository,
  makeEventPublisher,
  makeNodeRepository,
  makeOntologyRepository,
  makeUnitOfWork,
} from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = testHash('author-1');
const proposerHash = testHash('proposer-1');

/** The duplicate: the node that will be merged away. */
function duplicate(status: Node['status'] = 'PENDING'): Node {
  return new Node(
    'node-duplicate',
    WS,
    'Problem',
    'Shuttle is late',
    null,
    { source: 'minutes', area: 'transport' },
    authorHash,
    status,
    3
  );
}

/** The survivor: the node that keeps living. */
function survivor(status: Node['status'] = 'ACTIVE'): Node {
  return new Node(
    'node-survivor',
    WS,
    'Problem',
    'Campus shuttle delays',
    null,
    { area: 'mobility' },
    authorHash,
    status,
    5
  );
}

function makeProposalRepo(existing: EditProposal | null = null): {
  repo: IProposalRepository;
  saved: EditProposal[];
  pending: EditProposal[];
} {
  const saved: EditProposal[] = [];
  const pending: EditProposal[] = [];
  const repo: IProposalRepository = {
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
      return pending;
    },
    async save(proposal) {
      saved.push(proposal);
    },
    async updateStatus() {},
  };
  return { repo, saved, pending };
}

function makeInteractionRepo(): IInteractionRepository {
  return {
    async findByUserAndTarget() {
      return null;
    },
    async existsInWorkspace() {
      return true;
    },
    async save() {},
    async applyScoreDelta() {},
  };
}

function makeOntologyRepo(): IOntologyRepository {
  return makeOntologyRepository().repo;
}

describe('CreateProposalUseCase — a MERGE proposal', () => {
  const input = {
    targetId: 'node-duplicate',
    targetType: 'NODE' as const,
    kind: 'MERGE' as const,
    workspaceId: WS,
    tid,
    proposerHash: proposerHash.toString(),
  };

  function build(nodes: Node[], pending: EditProposal[] = []) {
    const { repo, saved } = makeProposalRepo();
    const proposalRepo: IProposalRepository = {
      ...repo,
      async findPendingByTarget() {
        return pending;
      },
    };
    const { publisher, events } = makeEventPublisher();
    const useCase = new CreateProposalUseCase(
      proposalRepo,
      makeInteractionRepo(),
      makeOntologyRepo(),
      makeNodeRepository(nodes).repo,
      publisher
    );
    return { useCase, saved, events };
  }

  it('saves the merge proposal when both nodes exist', async () => {
    const { useCase, saved, events } = build([duplicate(), survivor()]);

    await useCase.execute({
      ...input,
      proposedChanges: { mergeIntoNodeId: 'node-survivor' },
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe('MERGE');
    expect(saved[0].targetId).toBe('node-duplicate');
    expect(saved[0].mergeTargetId).toBe('node-survivor');
    expect(events).toContain('PROPOSAL_CREATED');
  });

  it('rejects a merge without the surviving node', async () => {
    const { useCase, saved } = build([duplicate(), survivor()]);

    await expect(
      useCase.execute({ ...input, proposedChanges: {} })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(saved).toHaveLength(0);
  });

  it('rejects a merge into itself', async () => {
    const { useCase, saved } = build([duplicate(), survivor()]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-duplicate' },
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(saved).toHaveLength(0);
  });

  it('reports a missing survivor as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, saved } = build([duplicate()]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-survivor' },
      })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(saved).toHaveLength(0);
  });

  it('reports a missing duplicate as ERR_NODE_NOT_FOUND', async () => {
    const { useCase, saved } = build([survivor()]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-survivor' },
      })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });
    expect(saved).toHaveLength(0);
  });

  it('refuses to merge a terminal node', async () => {
    const { useCase, saved } = build([duplicate('MERGED'), survivor()]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-survivor' },
      })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(saved).toHaveLength(0);
  });

  it('refuses a survivor that was merged away', async () => {
    const { useCase, saved } = build([duplicate(), survivor('MERGED')]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-survivor' },
      })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(saved).toHaveLength(0);
  });

  it('refuses a second pending merge proposal for the same node', async () => {
    const pending = new EditProposal(
      'proposal-old',
      WS,
      'node-duplicate',
      'NODE',
      { mergeIntoNodeId: 'node-survivor' },
      proposerHash,
      'PENDING',
      null,
      0,
      null,
      null,
      new Date(),
      'MERGE'
    );
    const { useCase, saved } = build([duplicate(), survivor()], [pending]);

    await expect(
      useCase.execute({
        ...input,
        proposedChanges: { mergeIntoNodeId: 'node-survivor' },
      })
    ).rejects.toMatchObject({ code: 'ERR_DUPLICATE_PROPOSAL' });
    expect(saved).toHaveLength(0);
  });
});

describe('ApproveProposalUseCase — applying a MERGE proposal', () => {
  function build(nodes: Node[], proposal: EditProposal) {
    const { repo } = makeProposalRepo(proposal);
    const nodeRepo = makeNodeRepository(nodes);
    const edgeRepo = makeEdgeRepository();
    const ontologyRepo = makeOntologyRepository();
    const { uow, ran } = makeUnitOfWork();
    const { publisher, events } = makeEventPublisher();

    const useCase = new ApproveProposalUseCase(
      nodeRepo.repo,
      edgeRepo.repo,
      ontologyRepo.repo,
      repo,
      uow,
      publisher
    );
    return { useCase, nodeRepo, edgeRepo, ran, events };
  }

  function mergeProposal(): EditProposal {
    return new EditProposal(
      'proposal-1',
      WS,
      'node-duplicate',
      'NODE',
      { mergeIntoNodeId: 'node-survivor' },
      proposerHash,
      'PENDING',
      null,
      0,
      null,
      null,
      new Date(),
      'MERGE'
    );
  }

  const input = {
    proposalId: 'proposal-1',
    resolverUserId: 'user-1',
    resolverHash: authorHash.toString(),
    workspaceId: WS,
    tid,
  };

  it('merges the duplicate into the survivor', async () => {
    const dupe = duplicate();
    const surv = survivor();
    const { useCase, nodeRepo, edgeRepo, ran, events } = build([dupe, surv], mergeProposal());

    await useCase.execute(input);

    // The duplicate leaves the graph and points at the survivor.
    expect(dupe.status).toBe('MERGED');
    expect(dupe.mergedIntoId).toBe('node-survivor');
    // The survivor adopts what the duplicate had and nobody else.
    expect(surv.attributes).toEqual({ source: 'minutes', area: 'mobility' });
    expect(surv.communityScore).toBe(8);

    // The adapter was asked to persist the merge and to re-point the edges.
    expect(nodeRepo.merges).toEqual([
      { sourceId: 'node-duplicate', targetId: 'node-survivor', tx: expect.anything() },
    ]);
    expect(edgeRepo.repointed).toEqual([
      {
        nodeId: 'node-duplicate',
        replacementId: 'node-survivor',
        workspaceId: WS,
        tx: expect.anything(),
      },
    ]);
    expect(ran.count).toBe(1);
    expect(events).toContain('PROPOSAL_APPROVED');
    expect(events).toContain('NODE_MERGED');
  });

  it('never applies an attribute delta for a merge proposal', async () => {
    const dupe = duplicate();
    const surv = survivor();
    const { useCase, nodeRepo } = build([dupe, surv], mergeProposal());

    await useCase.execute(input);

    expect(nodeRepo.appliedDeltas).toEqual([]);
  });

  it('reports a survivor outside the workspace as ERR_NODE_NOT_FOUND', async () => {
    const dupe = duplicate();
    const foreign = new Node(
      'node-survivor',
      'ws-other',
      'Problem',
      'Elsewhere',
      null,
      {},
      authorHash,
      'ACTIVE'
    );
    const { useCase, nodeRepo, edgeRepo } = build([dupe, foreign], mergeProposal());

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_NODE_NOT_FOUND',
    });
    // The transaction rolls back: nothing was written and no edge moved.
    expect(nodeRepo.merges).toEqual([]);
    expect(edgeRepo.repointed).toEqual([]);
  });

  it('reports a merge proposal without a surviving node as ERR_VALIDATION_FAILED', async () => {
    const proposal = new EditProposal(
      'proposal-1',
      WS,
      'node-duplicate',
      'NODE',
      {},
      proposerHash,
      'PENDING',
      null,
      0,
      null,
      null,
      new Date(),
      'MERGE'
    );
    const { useCase, nodeRepo } = build([duplicate(), survivor()], proposal);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_VALIDATION_FAILED',
    });
    expect(nodeRepo.merges).toEqual([]);
  });

  it('refuses a merge whose survivor was merged away in the meantime', async () => {
    // Two nodes that both proposed to absorb each other: the first approval
    // merges A into B, so B can no longer absorb A (and the graph would end
    // up without a survivor).
    const dupe = duplicate();
    const surv = survivor('MERGED');
    const { useCase, nodeRepo, edgeRepo } = build([dupe, surv], mergeProposal());

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_INVALID_STATE_TRANSITION',
    });
    expect(nodeRepo.merges).toEqual([]);
    expect(edgeRepo.repointed).toEqual([]);
  });

  it('refuses a merge whose duplicate was merged away in the meantime', async () => {
    const dupe = duplicate('MERGED');
    const surv = survivor();
    const { useCase, nodeRepo, edgeRepo } = build([dupe, surv], mergeProposal());

    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_INVALID_STATE_TRANSITION',
    });
    expect(nodeRepo.merges).toEqual([]);
    expect(edgeRepo.repointed).toEqual([]);
  });
});
