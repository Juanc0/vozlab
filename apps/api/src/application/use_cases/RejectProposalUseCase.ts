import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import type { ResolveProposalInput } from './ApproveProposalUseCase.js';

/**
 * Use Case: maintainer rejects an edit proposal — RF-12.
 *
 * Unlike approval, rejection does not touch the target entity; only the
 * proposal status is updated (still inside a UnitOfWork for consistency).
 */
export class RejectProposalUseCase {
  constructor(
    private readonly proposalRepo: IProposalRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ResolveProposalInput): Promise<EditProposal> {
    const proposal = await this.proposalRepo.findById(input.proposalId, input.tid);
    if (!proposal) {
      throw new DomainError('ERR_PROPOSAL_NOT_FOUND');
    }

    const resolver = AuthorHash.fromRawOrIdentity(input.resolverHash, 'default-salt');
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
