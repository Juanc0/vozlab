import { randomUUID } from 'node:crypto';
import { EditProposal, ProposalKind, TargetType } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IInteractionRepository } from '../../domain/ports/IInteractionRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
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
  /** The kind of the proposal (ADR-0026). Defaults to `EDIT`. */
  kind?: ProposalKind;
}

/**
 * Use Case: open a Pull-Request style edit proposal (RF-10).
 *
 * The proposal is always created in `PENDING`; only the target's maintainer
 * (author) — or a moderator via auto-apply — can resolve it.
 *
 * A `MERGE` proposal (ADR-0026) is validated here, when it is created: the
 * duplicate and the survivor must exist in the request workspace, the
 * duplicate must be in a mergeable state and it must not have another
 * pending merge proposal.
 */
export class CreateProposalUseCase {
  constructor(
    private readonly proposalRepo: IProposalRepository,
    private readonly interactionRepo: IInteractionRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly nodeRepo: INodeRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CreateProposalInput): Promise<EditProposal> {
    const kind: ProposalKind = input.kind ?? 'EDIT';

    const proposal = new EditProposal(
      randomUUID(),
      input.workspaceId,
      input.targetId,
      input.targetType,
      input.proposedChanges,
      AuthorHash.fromString(input.proposerHash),
      'PENDING',
      input.justification ?? null,
      0,
      null,
      null,
      new Date(),
      kind
    );

    // Validate that the target exists in the request workspace (TASK-33).
    // Missing or foreign-workspace targets are indistinguishable (404, never 403).
    switch (input.targetType) {
      case 'NODE': {
        if (kind === 'MERGE') {
          await this.validateMerge(input);
          break;
        }
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

  /**
   * Validate a merge proposal (ADR-0026).
   *
   * The proposal's target is the duplicate and `mergeIntoNodeId` is the
   * survivor. A node outside the workspace reads as missing (ADR-0008), and
   * a node that is already merged away cannot be merged again.
   */
  private async validateMerge(input: CreateProposalInput): Promise<void> {
    const survivorId = input.proposedChanges?.mergeIntoNodeId;
    if (typeof survivorId !== 'string' || survivorId.length === 0) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'a merge proposal must name the surviving node'
      );
    }
    if (survivorId === input.targetId) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'a node cannot be merged into itself'
      );
    }

    const duplicate = await this.nodeRepo.findByIdInWorkspace(
      input.targetId,
      input.workspaceId,
      input.tid
    );
    if (!duplicate) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
    if (!duplicate.isMergeable) {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `a node in status ${duplicate.status} cannot be merged away`
      );
    }

    const survivor = await this.nodeRepo.findByIdInWorkspace(
      survivorId,
      input.workspaceId,
      input.tid
    );
    if (!survivor) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
    if (!survivor.isMergeable) {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `a node in status ${survivor.status} cannot absorb another node`
      );
    }

    // A node can only be merged away once: one pending merge proposal per
    // target.
    const pending = await this.proposalRepo.findPendingByTarget(input.targetId, input.tid);
    if (pending.some((proposal) => proposal.kind === 'MERGE')) {
      throw new DomainError(
        'ERR_DUPLICATE_PROPOSAL',
        'a pending merge proposal already exists for this node'
      );
    }
  }
}
