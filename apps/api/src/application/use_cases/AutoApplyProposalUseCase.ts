import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import type { ResolveProposalInput } from './ApproveProposalUseCase.js';

/**
 * Use Case: moderator auto-applies an edit proposal — RF-13.
 *
 * The maintainer keeps the exclusive approve/reject power (FR-12); a
 * moderator may only override when the domain criteria are met
 * (`community_score >= 10` and the proposal is older than 14 days).
 * That rule lives in `EditProposal.autoApply` and surfaces as
 * `ERR_UNMET_AUTO_APPLY_CRITERIA`.
 *
 * Applies the delta and flips the status inside one UnitOfWork transaction,
 * then publishes `PROPOSAL_AUTO_APPLIED` post-commit, best-effort.
 */
export class AutoApplyProposalUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly proposalRepo: IProposalRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ResolveProposalInput): Promise<EditProposal> {
    const proposal = await this.proposalRepo.findById(input.proposalId, input.tid);
    if (!proposal) {
      throw new DomainError('ERR_PROPOSAL_NOT_FOUND');
    }

    // Only MODERATOR / ADMIN may use the override path (FR-13).
    const role = await this.membershipRepo.getRole(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );
    if (role !== 'MODERATOR' && role !== 'ADMIN') {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    const resolver = AuthorHash.fromRawOrIdentity(input.resolverHash, 'default-salt');
    // Domain rule: throws ERR_UNMET_AUTO_APPLY_CRITERIA when < 14 days or score < 10.
    proposal.autoApply(resolver);

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
    await this.eventPublisher.publish('PROPOSAL_AUTO_APPLIED', {
      reqId: input.reqId ?? '',
      proposalId: proposal.id,
      targetId: proposal.targetId,
      targetType: proposal.targetType,
      workspaceId: input.workspaceId,
    });

    return proposal;
  }
}
