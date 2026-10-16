import { and, eq } from 'drizzle-orm';
import { editProposals } from '@vozlab/database';
import {
  EditProposal,
  ProposalStatus,
  TargetType,
} from '../../../domain/entities/EditProposal.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IProposalRepository } from '../../../domain/ports/IProposalRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/**
 * DrizzleProposalRepository: adapter that persists EditProposals to
 * `public.edit_proposals` inside the tenant's physical database.
 *
 * Scoped by `tid`; reuses the UnitOfWork transaction (`tx`) when provided
 * so the node delta and the proposal status change commit atomically.
 */
export class DrizzleProposalRepository implements IProposalRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  /** Resolve the Drizzle client: the open transaction, or the tenant pool. */
  private async client(tid: string, tx?: any) {
    return tx ?? (await this.poolManager.getDb(tid));
  }

  async findById(id: string, tid: string): Promise<EditProposal | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(editProposals)
      .where(eq(editProposals.id, id))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findPendingByTarget(targetId: string, tid: string): Promise<EditProposal[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(editProposals)
      .where(
        and(
          eq(editProposals.targetId, targetId),
          eq(editProposals.status, 'PENDING')
        )
      );

    return rows.map(toDomain);
  }

  async save(proposal: EditProposal, tid: string, tx?: any): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(editProposals).values({
      id: proposal.id,
      workspaceId: proposal.workspaceId,
      targetId: proposal.targetId,
      targetType: proposal.targetType,
      proposerHash: proposal.proposerHash.toString(),
      proposedChanges: proposal.proposedChanges,
      justification: proposal.justification,
      communityScore: proposal.communityScore,
      status: proposal.status,
      resolvedBy: proposal.resolvedBy?.toString() ?? null,
      resolvedAt: proposal.resolvedAt,
      createdAt: proposal.createdAt,
    });
  }

  async updateStatus(
    id: string,
    status: ProposalStatus,
    resolvedBy: string,
    tid: string,
    tx?: any
  ): Promise<void> {
    const db = await this.client(tid, tx);
    await db
      .update(editProposals)
      .set({ status, resolvedBy, resolvedAt: new Date() })
      .where(eq(editProposals.id, id));
  }
}

/**
 * Map a `public.edit_proposals` row to the pure domain entity.
 */
function toDomain(row: typeof editProposals.$inferSelect): EditProposal {
  return new EditProposal(
    row.id,
    row.workspaceId,
    row.targetId,
    row.targetType as TargetType,
    (row.proposedChanges as Record<string, any>) ?? {},
    AuthorHash.fromString(row.proposerHash),
    row.status as ProposalStatus,
    row.justification ?? null,
    row.communityScore,
    row.resolvedBy ? AuthorHash.fromString(row.resolvedBy) : null,
    row.resolvedAt ?? null,
    row.createdAt
  );
}
