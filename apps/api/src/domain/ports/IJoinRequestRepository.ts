import type { DbTransaction } from './Transaction.js';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface JoinRequestRecord {
  id: string;
  workspaceId: string;
  userId: string;
  status: JoinRequestStatus;
  message: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/** Inbox row: the request joined with its author. */
export interface JoinRequestWithUser extends JoinRequestRecord {
  handle: string | null;
  fullName: string | null;
}

/** The caller's own requests, joined with the workspace. */
export interface JoinRequestWithWorkspace extends JoinRequestRecord {
  workspaceName: string;
}

export interface CreateJoinRequestInput {
  workspaceId: string;
  userId: string;
  message: string | null;
}

/**
 * Port: `auth.workspace_join_requests` (US-00).
 *
 * A request is never a grant: `decide` only flips its status, and the
 * approving use case creates the membership in the same transaction.
 */
export interface IJoinRequestRepository {
  create(
    input: CreateJoinRequestInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord>;

  /**
   * Insert-or-conflict probe used inside a redemption transaction (T4-M1).
   * Unlike `create` this never falls back to the existing row: it inserts
   * with `ON CONFLICT … DO NOTHING RETURNING` against the partial unique
   * PENDING index and answers `null` when a PENDING request already won —
   * leaving the caller free to roll the surrounding transaction back (a
   * duplicate presentation must not burn a credential use).
   */
  createIfAbsent(
    input: CreateJoinRequestInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord | null>;

  findPending(
    workspaceId: string,
    userId: string,
    tid: string
  ): Promise<JoinRequestRecord | null>;

  findById(
    requestId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord | null>;

  listByWorkspace(
    workspaceId: string,
    status: JoinRequestStatus,
    tid: string,
    limit: number
  ): Promise<JoinRequestWithUser[]>;

  listByUser(userId: string, tid: string): Promise<JoinRequestWithWorkspace[]>;

  /**
   * Flip a PENDING request to APPROVED/REJECTED. Returns `null` when the
   * request was already decided, so callers never approve twice.
   */
  decide(
    requestId: string,
    status: Exclude<JoinRequestStatus, 'PENDING'>,
    decidedBy: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<JoinRequestRecord | null>;
}
