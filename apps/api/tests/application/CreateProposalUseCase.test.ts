import { describe, expect, it, vi } from 'vitest';

// Mock env.ts before importing any module that imports it
vi.mock('../../src/shared/config/env.js', () => ({
  env: {
    AUTHOR_HASH_SALT: 'test-author-hash-salt-12345',
  },
}));

import { CreateProposalUseCase } from '../../src/application/use_cases/CreateProposalUseCase.js';
import { EditProposal } from '../../src/domain/entities/EditProposal.js';
import type { IProposalRepository } from '../../src/domain/ports/IProposalRepository.js';
import type { IInteractionRepository } from '../../src/domain/ports/IInteractionRepository.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import type { IEventPublisher } from '../../src/domain/ports/IEventPublisher.js';
import type { OntologyClass } from '../../src/domain/entities/OntologyClass.js';

function makeProposalRepo(): {
  repo: IProposalRepository;
  saved: EditProposal[];
} {
  const saved: EditProposal[] = [];
  const repo: IProposalRepository = {
    async findByIdInWorkspace() {
      return null;
    },
    async findByWorkspace() {
      return { items: [], nextCursor: null };
    },
    async save(proposal) {
      saved.push(proposal);
    },
    async updateStatus() {},
  };
  return { repo, saved };
}

function makeInteractionRepo(existingTargets: Set<string>): IInteractionRepository {
  return {
    async findByUserAndTarget() {
      return null;
    },
    async existsInWorkspace(targetId, targetType, workspaceId) {
      return existingTargets.has(`${workspaceId}:${targetType}:${targetId}`);
    },
    async save() {},
    async applyScoreDelta() {},
  };
}

function makeOntologyRepo(classes: Map<string, OntologyClass>): IOntologyRepository {
  return {
    async findActiveClasses() {
      return [];
    },
    async findActiveObjectProperties() {
      return [];
    },
    async findClassByKey() {
      return null;
    },
    async findClassById(id, workspaceId) {
      const cls = classes.get(`${workspaceId}:${id}`);
      return cls ?? null;
    },
    async saveClass() {},
    async applyClassDelta() {},
    async activateClass() {},
    async saveDatatypeProperty() {},
    async saveObjectProperty() {},
  };
}

function makeEventPublisher(): { publisher: IEventPublisher; events: string[] } {
  const events: string[] = [];
  const publisher: IEventPublisher = {
    async publish(event) {
      events.push(event);
    },
  };
  return { publisher, events };
}

describe('CreateProposalUseCase', () => {
  it('saves proposal when target exists in the same workspace (NODE)', async () => {
    const { repo, saved } = makeProposalRepo();
    const existingTargets = new Set(['ws-1:NODE:node-123']);
    const interactionRepo = makeInteractionRepo(existingTargets);
    const ontologyRepo = makeOntologyRepo(new Map());
    const { publisher, events } = makeEventPublisher();

    const useCase = new CreateProposalUseCase(repo, interactionRepo, ontologyRepo, publisher);

    const proposal = await useCase.execute({
      targetId: 'node-123',
      targetType: 'NODE',
      proposedChanges: { title: 'Updated' },
      workspaceId: 'ws-1',
      tid: 'tenant-1',
      proposerHash: 'proposer-1',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(proposal.id);
    expect(saved[0].targetId).toBe('node-123');
    expect(events).toContain('PROPOSAL_CREATED');
  });

  it('rejects with ERR_NODE_NOT_FOUND when target does not exist', async () => {
    const { repo, saved } = makeProposalRepo();
    const interactionRepo = makeInteractionRepo(new Set());
    const ontologyRepo = makeOntologyRepo(new Map());
    const { publisher, events } = makeEventPublisher();

    const useCase = new CreateProposalUseCase(repo, interactionRepo, ontologyRepo, publisher);

    await expect(
      useCase.execute({
        targetId: 'nonexistent-node',
        targetType: 'NODE',
        proposedChanges: {},
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        proposerHash: 'proposer-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });

    expect(saved).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('rejects with ERR_NODE_NOT_FOUND when target belongs to another workspace', async () => {
    const { repo, saved } = makeProposalRepo();
    // node exists in ws-foreign, not in ws-1
    const existingTargets = new Set(['ws-foreign:NODE:node-123']);
    const interactionRepo = makeInteractionRepo(existingTargets);
    const ontologyRepo = makeOntologyRepo(new Map());
    const { publisher, events } = makeEventPublisher();

    const useCase = new CreateProposalUseCase(repo, interactionRepo, ontologyRepo, publisher);

    await expect(
      useCase.execute({
        targetId: 'node-123',
        targetType: 'NODE',
        proposedChanges: {},
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        proposerHash: 'proposer-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });

    expect(saved).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('rejects with ERR_EDGE_NOT_FOUND when EDGE target does not exist in workspace', async () => {
    const { repo, saved } = makeProposalRepo();
    const interactionRepo = makeInteractionRepo(new Set());
    const ontologyRepo = makeOntologyRepo(new Map());
    const { publisher } = makeEventPublisher();

    const useCase = new CreateProposalUseCase(repo, interactionRepo, ontologyRepo, publisher);

    await expect(
      useCase.execute({
        targetId: 'edge-999',
        targetType: 'EDGE',
        proposedChanges: {},
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        proposerHash: 'proposer-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_EDGE_NOT_FOUND' });

    expect(saved).toHaveLength(0);
  });

  it('rejects with ERR_VALIDATION_FAILED when ONTOLOGY class does not exist in workspace', async () => {
    const { repo, saved } = makeProposalRepo();
    const interactionRepo = makeInteractionRepo(new Set());
    const ontologyRepo = makeOntologyRepo(new Map());
    const { publisher } = makeEventPublisher();

    const useCase = new CreateProposalUseCase(repo, interactionRepo, ontologyRepo, publisher);

    await expect(
      useCase.execute({
        targetId: 'class-abc',
        targetType: 'ONTOLOGY',
        proposedChanges: {},
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        proposerHash: 'proposer-1',
      })
    ).rejects.toMatchObject({
      code: 'ERR_VALIDATION_FAILED',
      message: 'ERR_VALIDATION_FAILED: ontology class class-abc not found',
    });

    expect(saved).toHaveLength(0);
  });
});
