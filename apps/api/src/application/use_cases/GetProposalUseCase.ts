import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';

export type GetProposalInput = {
  proposalId: string;
  workspaceId: string;
  tid: string;
};

/**
 * Use Case: read a single proposal owned by the active workspace.
 *
 * Enforces workspace isolation at the application boundary: a proposal that
 * exists but belongs to another workspace is indistinguishable from a
 * missing one (`ERR_PROPOSAL_NOT_FOUND` → 404, never 403).
 */
export class GetProposalUseCase {
  constructor(private readonly proposalRepo: IProposalRepository) {}

  async execute(input: GetProposalInput): Promise<EditProposal> {
    const proposal = await this.proposalRepo.findByIdInWorkspace(
      input.proposalId,
      input.workspaceId,
      input.tid
    );
    if (!proposal) {
      throw new DomainError('ERR_PROPOSAL_NOT_FOUND');
    }
    return proposal;
  }
}
