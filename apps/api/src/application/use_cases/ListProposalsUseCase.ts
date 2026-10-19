import {
  EditProposal,
  ProposalStatus,
  TargetType,
} from '../../domain/entities/EditProposal.js';
import { IProposalRepository } from '../../domain/ports/IProposalRepository.js';

export type ListProposalsInput = {
  workspaceId: string;
  tid: string;
  limit: number;
  cursor?: string;
  status?: ProposalStatus;
  targetType?: TargetType;
};

export type ListProposalsResult = {
  items: EditProposal[];
  nextCursor: string | null;
};

/**
 * Use Case: cursor-paginated listing of the workspace's proposals (NFR-04),
 * optionally filtered by status/targetType. Delegates keyset pagination to
 * the repository port so the application layer stays storage-agnostic.
 */
export class ListProposalsUseCase {
  constructor(private readonly proposalRepo: IProposalRepository) {}

  async execute(input: ListProposalsInput): Promise<ListProposalsResult> {
    return this.proposalRepo.listByWorkspace(
      input.workspaceId,
      {
        status: input.status,
        targetType: input.targetType,
        limit: input.limit,
        cursor: input.cursor,
      },
      input.tid
    );
  }
}
