import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';

/**
 * Repositories needed to resolve the maintainer (target author) of a proposal.
 * Injected by the use cases; the domain stays free of persistence concerns.
 */
export interface ProposalTargetRepositories {
  nodeRepo: INodeRepository;
  edgeRepo: IEdgeRepository;
  ontologyRepo: IOntologyRepository;
}

/**
 * Resolve the maintainer hash of the proposal's target object (FR-12).
 *
 * Throws a typed `DomainError` when the target no longer exists — a proposal
 * must never resolve silently against a missing object.
 */
export async function resolveTargetAuthorHash(
  repos: ProposalTargetRepositories,
  proposal: EditProposal,
  workspaceId: string,
  tid: string
): Promise<string> {
  switch (proposal.targetType) {
    case 'NODE': {
      const node = await repos.nodeRepo.findByIdInWorkspace(proposal.targetId, workspaceId, tid);
      if (!node) throw new DomainError('ERR_NODE_NOT_FOUND');
      return node.authorHash.toString();
    }
    case 'EDGE': {
      const edge = await repos.edgeRepo.findByIdInWorkspace(proposal.targetId, workspaceId, tid);
      if (!edge) throw new DomainError('ERR_EDGE_NOT_FOUND');
      return edge.authorHash.toString();
    }
    case 'ONTOLOGY': {
      const cls = await repos.ontologyRepo.findClassById(proposal.targetId, workspaceId, tid);
      if (!cls) throw new DomainError('ERR_VALIDATION_FAILED');
      return cls.proposedBy;
    }
    default:
      throw new DomainError('ERR_VALIDATION_FAILED');
  }
}

/**
 * The exclusive power to approve/reject belongs to the target's maintainer
 * (FR-12): any other caller receives `403 ERR_AUTHORIZATION_FAILED`.
 */
export function assertIsMaintainer(resolverHash: string, targetAuthorHash: string): void {
  if (resolverHash !== targetAuthorHash) {
    throw new DomainError('ERR_AUTHORIZATION_FAILED');
  }
}
