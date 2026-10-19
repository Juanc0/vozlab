import { EditProposal, ProposalStatus, TargetType } from '../entities/EditProposal.js';

// Naming follows `modules_02 §6.8`.
/**
 * Port: EditProposal repository interface.
 *
 * Every method is scoped to a tenant (`tid`) to guarantee physical
 * multi-tenant isolation — the pool manager resolves a dedicated
 * connection per tenant.
 */
export interface IProposalRepository {
  findById(id: string, tid: string): Promise<EditProposal | null>;
  /**
   * Read a single proposal only when it belongs to `workspaceId`. A proposal
   * in another workspace is indistinguishable from a missing one (404).
   */
  findByIdInWorkspace(
    id: string,
    workspaceId: string,
    tid: string
  ): Promise<EditProposal | null>;
  /**
   * List a workspace's proposals using keyset (cursor) pagination ordered by
   * `createdAt DESC, id DESC`, optionally filtered by `status`/`targetType`.
   */
  listByWorkspace(
    workspaceId: string,
    opts: {
      status?: ProposalStatus;
      targetType?: TargetType;
      limit: number;
      cursor?: string;
    },
    tid: string
  ): Promise<{ items: EditProposal[]; nextCursor: string | null }>;
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
