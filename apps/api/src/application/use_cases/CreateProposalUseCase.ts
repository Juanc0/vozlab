import { randomUUID } from 'node:crypto';
import { EditProposal, TargetType } from '../../domain/entities/EditProposal.js';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export interface CreateProposalInput {
  targetId: string;
  targetType: TargetType;
  proposedChanges: Record<string, any>;
  justification?: string;
  workspaceId: string;
  tid: string;
  proposerHash: string;
  reqId?: string;
}

/**
 * Use Case: open a Pull-Request style edit proposal (RF-10).
 *
 * The proposal is always created in `PENDING`; only the target's maintainer
 * (author) — or a moderator via auto-apply — can resolve it.
 */
export class CreateProposalUseCase {
  constructor(
    private readonly proposalRepo: IProposalRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CreateProposalInput): Promise<EditProposal> {
    const proposal = new EditProposal(
      randomUUID(),
      input.workspaceId,
      input.targetId,
      input.targetType,
      input.proposedChanges,
      AuthorHash.fromRawOrIdentity(input.proposerHash, 'default-salt'),
      'PENDING',
      input.justification ?? null
    );

    await this.proposalRepo.save(proposal, input.tid);

    await this.eventPublisher.publish('PROPOSAL_CREATED', {
      reqId: input.reqId ?? '',
      proposalId: proposal.id,
      targetId: proposal.targetId,
      targetType: proposal.targetType,
      workspaceId: proposal.workspaceId,
    });

    return proposal;
  }
}
