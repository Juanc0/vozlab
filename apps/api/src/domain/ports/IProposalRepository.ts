import { EditProposal, ProposalStatus } from '../entities/EditProposal.js';

/**
 * Port: EditProposal repository interface.
 *
 * Every method is scoped to a tenant (`tid`) to guarantee physical
 * multi-tenant isolation — the pool manager resolves a dedicated
 * connection per tenant.
 */
export interface IProposalRepository {
  findById(id: string, tid: string): Promise<EditProposal | null>;
  findPendingByTarget(targetId: string, tid: string): Promise<EditProposal[]>;
  save(proposal: EditProposal, tid: string, tx?: any): Promise<void>;
  updateStatus(
    id: string,
    status: ProposalStatus,
    resolvedBy: string,
    tid: string,
    tx?: any
  ): Promise<void>;
}
