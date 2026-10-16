import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { EditProposal } from '../../domain/entities/EditProposal.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export interface ResolveProposalInput {
  proposalId: string;
  resolverHash: string;
  workspaceId: string;
  tid: string;
  reqId?: string;
}

/**
 * Use Case: maintainer approves an edit proposal (Merge) — RF-12.
 *
 * Applies the proposed delta to the target and flips the proposal status
 * inside a single UnitOfWork transaction (atomic), then publishes the
 * post-commit event outside the transaction.
 */
export class ApproveProposalUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly proposalRepo: IProposalRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ResolveProposalInput): Promise<EditProposal> {
    const proposal = await this.proposalRepo.findById(input.proposalId, input.tid);
    if (!proposal) {
      throw new Error('ERR_PROPOSAL_NOT_FOUND');
    }

    const resolver = AuthorHash.fromRawOrIdentity(input.resolverHash, 'default-salt');
    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION if not PENDING.
    proposal.approve(resolver);

    // Atomic multi-table write: node delta + proposal status.
    await this.uow.runInTransaction(input.tid, async (tx) => {
      if (proposal.targetType === 'NODE') {
        await this.nodeRepo.applyDelta(
          proposal.targetId,
          proposal.proposedChanges,
          input.workspaceId,
          input.tid,
          tx
        );
      }
      await this.proposalRepo.updateStatus(
        proposal.id,
        proposal.status,
        resolver.toString(),
        input.tid,
        tx
      );
    });

    // Post-commit, best-effort publication.
    await this.eventPublisher.publish('PROPOSAL_APPROVED', {
      reqId: input.reqId ?? '',
      proposalId: proposal.id,
      targetId: proposal.targetId,
      targetType: proposal.targetType,
      workspaceId: input.workspaceId,
    });

    return proposal;
  }
}
