import { randomUUID } from 'node:crypto';
import { EditProposal, TargetType } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { resolveAuthorHash } from '../services/resolveAuthorHash.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IInteractionRepository } from '../../domain/ports/IInteractionRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import { assertNever } from '../../shared/assertNever.js';

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
    private readonly interactionRepo: IInteractionRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CreateProposalInput): Promise<EditProposal> {
    const proposal = new EditProposal(
      randomUUID(),
      input.workspaceId,
      input.targetId,
      input.targetType,
      input.proposedChanges,
      resolveAuthorHash(input.proposerHash, input.proposerHash),
      'PENDING',
      input.justification ?? null
    );

    // Validate that the target exists in the request workspace (TASK-33).
    // Missing or foreign-workspace targets are indistinguishable (404, never 403).
    switch (input.targetType) {
      case 'NODE': {
        const exists = await this.interactionRepo.existsInWorkspace(
          input.targetId,
          'NODE',
          input.workspaceId,
          input.tid
        );
        if (!exists) {
          throw new DomainError('ERR_NODE_NOT_FOUND');
        }
        break;
      }
      case 'EDGE': {
        const exists = await this.interactionRepo.existsInWorkspace(
          input.targetId,
          'EDGE',
          input.workspaceId,
          input.tid
        );
        if (!exists) {
          throw new DomainError('ERR_EDGE_NOT_FOUND');
        }
        break;
      }
      case 'ONTOLOGY': {
        const cls = await this.ontologyRepo.findClassById(
          input.targetId,
          input.workspaceId,
          input.tid
        );
        if (!cls) {
          throw new DomainError(
            'ERR_VALIDATION_FAILED',
            `ontology class ${input.targetId} not found`
          );
        }
        break;
      }
      default:
        return assertNever(input.targetType, `Unhandled proposal target type: ${input.targetType}`);
    }

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
