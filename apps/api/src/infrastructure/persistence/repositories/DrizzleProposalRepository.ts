import { and, desc, eq } from 'drizzle-orm';
import { editProposals } from '@vozlab/database';
import {
  EditProposal,
  ProposalStatus,
  TargetType,
} from '../../../domain/entities/EditProposal.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { IProposalRepository } from '../../../domain/ports/IProposalRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { decodeCursor, encodeCursor, keysetAfter } from '../keyset.js';

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

  /**
   * Read a single proposal scoped to its workspace; a row from another
   * workspace is invisible to this caller (returns `null` → 404).
   */
  async findByIdInWorkspace(
    id: string,
    workspaceId: string,
    tid: string
  ): Promise<EditProposal | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(editProposals)
      .where(
        and(eq(editProposals.id, id), eq(editProposals.workspaceId, workspaceId))
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  /**
   * Keyset pagination over `(createdAt DESC, id DESC)` for a workspace's
   * proposals, optionally filtered by `status`/`targetType`. The cursor is
   * the shared opaque base64 token; a malformed token is a client error
   * (`ERR_VALIDATION_FAILED`) rather than a silent first page.
   */
  async listByWorkspace(
    workspaceId: string,
    opts: {
      status?: ProposalStatus;
      targetType?: TargetType;
      limit: number;
      cursor?: string;
    },
    tid: string
  ): Promise<{ items: EditProposal[]; nextCursor: string | null }> {
    const db = await this.client(tid);

    const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;
    if (opts.cursor && !decoded) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'invalid pagination cursor');
    }

    const conditions = [eq(editProposals.workspaceId, workspaceId)];
    if (opts.status) {
      conditions.push(eq(editProposals.status, opts.status));
    }
    if (opts.targetType) {
      conditions.push(eq(editProposals.targetType, opts.targetType));
    }
    if (decoded) {
      conditions.push(keysetAfter(editProposals.createdAt, editProposals.id, decoded, 'desc'));
    }

    // Fetch one extra row to detect whether a next page exists.
    const rows = await db
      .select()
      .from(editProposals)
      .where(and(...conditions))
      .orderBy(desc(editProposals.createdAt), desc(editProposals.id))
      .limit(opts.limit + 1);

    const hasNext = rows.length > opts.limit;
    const page = hasNext ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toDomain),
      nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
    };
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
