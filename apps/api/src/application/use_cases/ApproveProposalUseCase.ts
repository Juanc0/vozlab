import { resolveAuthorHash } from '../services/resolveAuthorHash.js';
import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import {
  assertIsMaintainer,
  resolveTargetAuthorHash,
} from './proposalAuthorization.js';

export interface ResolveProposalInput {
  proposalId: string;
  /** Authenticated user id (used for role-based checks, e.g. auto-apply). */
  resolverUserId: string;
  resolverHash: string;
  workspaceId: string;
  tid: string;
  reqId?: string;
}

/**
 * Repositories required to apply an approved proposal's delta to its
 * polymorphic target (FR-10).
 */
export interface ProposalDeltaRepositories {
  nodeRepo: INodeRepository;
  edgeRepo: IEdgeRepository;
  ontologyRepo: IOntologyRepository;
}

/**
 * Apply `proposal.proposedChanges` to the target entity selected by
 * `proposal.targetType` (NODE / EDGE / ONTOLOGY) — RF-10/FR-12.
 *
 * MUST run inside the caller's UnitOfWork `tx` so the target mutation and the
 * proposal status change commit atomically. An approved ONTOLOGY proposal
 * always ends with the class `ACTIVE` (FR-09).
 */
export async function applyProposalDelta(
  repos: ProposalDeltaRepositories,
  proposal: EditProposal,
  workspaceId: string,
  tid: string,
  tx: any
): Promise<void> {
  switch (proposal.targetType) {
    case 'NODE':
      await repos.nodeRepo.applyDelta(
        proposal.targetId,
        proposal.proposedChanges,
        workspaceId,
        tid,
        tx
      );
      return;
    case 'EDGE':
      await repos.edgeRepo.applyDelta(
        proposal.targetId,
        proposal.proposedChanges,
        workspaceId,
        tid,
        tx
      );
      return;
    case 'ONTOLOGY':
      await repos.ontologyRepo.applyClassDelta(
        proposal.targetId,
        proposal.proposedChanges,
        tid,
        tx
      );
      await repos.ontologyRepo.activateClass(proposal.targetId, tid, tx);
      return;
    default:
      throw new DomainError('ERR_VALIDATION_FAILED');
  }
}

/**
 * Use Case: maintainer approves an edit proposal (Merge) — RF-12.
 *
 * Only the target's maintainer may approve (FR-12); everyone else is
 * rejected with `ERR_AUTHORIZATION_FAILED`. Applies the proposed delta to the
 * target and flips the proposal status inside a single UnitOfWork transaction
 * (atomic), then publishes the post-commit event outside the transaction.
 */
export class ApproveProposalUseCase {
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

    const resolver = resolveAuthorHash(input.resolverHash, input.resolverUserId);

    // Maintainer-only (FR-12): resolve the target author and compare.
    const targetAuthorHash = await resolveTargetAuthorHash(
      { nodeRepo: this.nodeRepo, edgeRepo: this.edgeRepo, ontologyRepo: this.ontologyRepo },
      proposal,
      input.tid
    );
    assertIsMaintainer(resolver.toString(), targetAuthorHash);

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION if not PENDING.
    proposal.approve(resolver);

    // Atomic multi-table write: target delta + proposal status.
    await this.uow.runInTransaction(input.tid, async (tx) => {
      await applyProposalDelta(
        {
          nodeRepo: this.nodeRepo,
          edgeRepo: this.edgeRepo,
          ontologyRepo: this.ontologyRepo,
        },
        proposal,
        input.workspaceId,
        input.tid,
        tx
      );
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
