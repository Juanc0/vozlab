import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import type { ResolveProposalInput } from './ApproveProposalUseCase.js';
import {
  assertIsMaintainer,
  resolveTargetAuthorHash,
} from './proposalAuthorization.js';

/**
 * Use Case: maintainer rejects an edit proposal — RF-12.
 *
 * Only the target's maintainer may reject (FR-12); everyone else receives
 * `ERR_AUTHORIZATION_FAILED`. Unlike approval, rejection does not touch the
 * target entity; only the proposal status is updated (still inside a
 * UnitOfWork for consistency).
 */
export class RejectProposalUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly edgeRepo: IEdgeRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly proposalRepo: IProposalRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ResolveProposalInput): Promise<EditProposal> {
    const proposal = await this.proposalRepo.findById(input.proposalId, input.tid);
    if (!proposal) {
      throw new DomainError('ERR_PROPOSAL_NOT_FOUND');
    }

    // Workspace isolation (FR-05): a proposal outside the request workspace is
    // reported as not-found (never 403) before any role check runs.
    if (proposal.workspaceId !== input.workspaceId) {
      throw new DomainError('ERR_PROPOSAL_NOT_FOUND');
    }

    const resolver = AuthorHash.fromString(input.resolverHash);

    // Maintainer-only (FR-12): resolve the target author and compare.
    const targetAuthorHash = await resolveTargetAuthorHash(
      { nodeRepo: this.nodeRepo, edgeRepo: this.edgeRepo, ontologyRepo: this.ontologyRepo },
      proposal,
      input.workspaceId,
      input.tid
    );
    assertIsMaintainer(resolver.toString(), targetAuthorHash);

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION if not PENDING.
    proposal.reject(resolver);

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.proposalRepo.updateStatus(
        proposal.id,
        proposal.status,
        resolver.toString(),
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('PROPOSAL_REJECTED', {
      reqId: input.reqId ?? '',
      proposalId: proposal.id,
      targetId: proposal.targetId,
      targetType: proposal.targetType,
      workspaceId: input.workspaceId,
    });

    return proposal;
  }
}
