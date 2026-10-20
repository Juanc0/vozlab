import { testHash } from '../support/hash.js';
import { describe, it, expect, vi } from 'vitest';
import { resolveTargetAuthorHash } from '../../src/application/use_cases/proposalAuthorization.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { EditProposal, TargetType } from '../../src/domain/entities/EditProposal.js';
import { Node } from '../../src/domain/entities/Node.js';
import { Edge } from '../../src/domain/entities/Edge.js';
import { INodeRepository } from '../../src/domain/ports/INodeRepository.js';
import { IEdgeRepository } from '../../src/domain/ports/IEdgeRepository.js';
import { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';

describe('proposalAuthorization.resolveTargetAuthorHash', () => {
  const tid = 'tenant-1';
  const workspaceId = 'workspace-1';
  const authorHash = testHash('author-1');
  const proposerHash = testHash('proposer-1');

  const nodeRepo: INodeRepository = {
    findById: vi.fn(),
    findByIdInWorkspace: vi.fn(),
    listByWorkspace: vi.fn(),
    getSubgraph: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    applyDelta: vi.fn(),
    mergeInto: vi.fn(),
    setEmbedding: vi.fn(),
    findNearestInWorkspace: vi.fn(),
  };

  const edgeRepo: IEdgeRepository = {
    findById: vi.fn(),
    findByIdInWorkspace: vi.fn(),
    listAllByWorkspace: vi.fn(),
    listByWorkspace: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    applyDelta: vi.fn(),
    repointEdges: vi.fn(),
  };

  const ontologyRepo: IOntologyRepository = {
    findClassById: vi.fn(),
    findClassByKey: vi.fn(),
    findActiveClasses: vi.fn(),
    findDatatypeProperties: vi.fn(),
    findActiveDatatypeProperties: vi.fn(),
    findObjectProperty: vi.fn(),
    findActiveObjectProperties: vi.fn(),
    saveClass: vi.fn(),
    saveDatatypeProperty: vi.fn(),
    saveObjectProperty: vi.fn(),
    applyClassDelta: vi.fn(),
    activateClass: vi.fn(),
  };

  const repos = { nodeRepo, edgeRepo, ontologyRepo };

  it('resolves NODE author in same workspace', async () => {
    const node = new Node('n1', workspaceId, 'type', 'title', null, {}, authorHash, 'ACTIVE');
    vi.mocked(nodeRepo.findByIdInWorkspace).mockResolvedValue(node);

    const proposal = new EditProposal('p1', workspaceId, 'n1', 'NODE', {}, proposerHash);
    const author = await resolveTargetAuthorHash(repos, proposal, workspaceId, tid);

    expect(author).toBe(authorHash.toString());
    expect(nodeRepo.findByIdInWorkspace).toHaveBeenCalledWith('n1', workspaceId, tid);
  });

  it('throws ERR_NODE_NOT_FOUND for NODE in different workspace', async () => {
    vi.mocked(nodeRepo.findByIdInWorkspace).mockResolvedValue(null);

    const proposal = new EditProposal('p1', workspaceId, 'n1', 'NODE', {}, proposerHash);
    await expect(resolveTargetAuthorHash(repos, proposal, workspaceId, tid)).rejects.toThrow(new DomainError('ERR_NODE_NOT_FOUND'));
  });

  it('resolves EDGE author in same workspace', async () => {
    const edge = new Edge('e1', workspaceId, 'n1', 'n2', 'rel', {}, authorHash, 'ACTIVE');
    vi.mocked(edgeRepo.findByIdInWorkspace).mockResolvedValue(edge);

    const proposal = new EditProposal('p1', workspaceId, 'e1', 'EDGE', {}, proposerHash);
    const author = await resolveTargetAuthorHash(repos, proposal, workspaceId, tid);

    expect(author).toBe(authorHash.toString());
    expect(edgeRepo.findByIdInWorkspace).toHaveBeenCalledWith('e1', workspaceId, tid);
  });

  it('throws ERR_EDGE_NOT_FOUND for EDGE in different workspace', async () => {
    vi.mocked(edgeRepo.findByIdInWorkspace).mockResolvedValue(null);

    const proposal = new EditProposal('p1', workspaceId, 'e1', 'EDGE', {}, proposerHash);
    await expect(resolveTargetAuthorHash(repos, proposal, workspaceId, tid)).rejects.toThrow(new DomainError('ERR_EDGE_NOT_FOUND'));
  });

  it('throws ERR_VALIDATION_FAILED for missing ONTOLOGY class', async () => {
    vi.mocked(ontologyRepo.findClassById).mockResolvedValue(null);

    const proposal = new EditProposal('p1', workspaceId, 'c1', 'ONTOLOGY', {}, proposerHash);
    await expect(resolveTargetAuthorHash(repos, proposal, workspaceId, tid)).rejects.toThrow(new DomainError('ERR_VALIDATION_FAILED'));
  });

  it('throws ERR_VALIDATION_FAILED for unknown target type', async () => {
    const proposal = new EditProposal(
      'p1',
      workspaceId,
      'x1',
      'UNKNOWN' as unknown as TargetType,
      {},
      proposerHash
    );
    await expect(resolveTargetAuthorHash(repos, proposal, workspaceId, tid)).rejects.toThrow(new DomainError('ERR_VALIDATION_FAILED'));
  });
});
