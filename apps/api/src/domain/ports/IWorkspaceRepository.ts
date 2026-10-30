import type { DbTransaction } from './Transaction.js';

/** A workspace row as the administration layer reads it. */
export interface WorkspaceRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  /** 'EVENT' | 'PUBLIC' | 'PRIVATE' */
  kind: string;
  createdAt: Date;
}

/** A workspace plus the counters of the administration screen. */
export interface WorkspaceWithStats extends WorkspaceRecord {
  memberCount: number;
  pendingRequestCount: number;
}

/**
 * A public workspace offered to a tenant user. `pendingRequest` lets the
 * screen show “requested” instead of letting the user ask twice.
 */
export interface DiscoveredWorkspace extends WorkspaceRecord {
  pendingRequest: boolean;
}

export interface CreateWorkspaceRecordInput {
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  kind?: string;
}

export interface UpdateWorkspacePatch {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
}

/**
 * Port: `auth.workspaces` (tenant DB).
 *
 * Reads used by the administration screens and by workspace discovery, plus
 * the writes that create and configure a workspace. The workspace's join
 * credential lives exclusively in `auth.workspace_join_codes` (DEC-5 D3,
 * ADR-0045): the row itself stores no code.
 */
export interface IWorkspaceRepository {
  create(
    input: CreateWorkspaceRecordInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceRecord>;

  update(
    workspaceId: string,
    patch: UpdateWorkspacePatch,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceRecord | null>;

  /**
   * Lock the workspace row inside a transaction. Admin mutations that depend
   * on a count (the last active ADMIN) serialize on this row.
   */
  lockById(
    workspaceId: string,
    tid: string,
    tx: DbTransaction
  ): Promise<WorkspaceRecord | null>;

  findById(workspaceId: string, tid: string): Promise<WorkspaceRecord | null>;
  findBySlug(slug: string, tid: string): Promise<WorkspaceRecord | null>;

  listWithStats(tid: string): Promise<WorkspaceWithStats[]>;
  getStats(workspaceId: string, tid: string): Promise<WorkspaceWithStats | null>;

  /**
   * Public workspaces the user is **not** an active member of. A workspace
   * with a PENDING request is still listed, flagged so the screen can show
   * “requested” instead of offering the form again. A tenant is small; the
   * screen lists them all.
   */
  listPublicForUser(tid: string, userId: string): Promise<DiscoveredWorkspace[]>;
}
