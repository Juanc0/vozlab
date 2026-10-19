import { DbTransaction } from './Transaction.js';
import { Edge } from '../entities/Edge.js';

// Naming follows `modules_02 §6.8`.
/**
 * Port: Edge persistence contract. Scoped by `tid` (physical tenant DB).
 */
export interface IEdgeRepository {
  findById(id: string, tid: string): Promise<Edge | null>;
  findByIdInWorkspace(id: string, workspaceId: string, tid: string): Promise<Edge | null>;
  /** List (unpaginated) non-deleted edges of a workspace. */
  listAllByWorkspace(workspaceId: string, tid: string): Promise<Edge[]>;
  /**
   * List non-deleted edges of a workspace using keyset (cursor) pagination
   * ordered by `createdAt DESC, id DESC` (NFR-04, O(1) — never OFFSET).
   *
   * `cursor` is an opaque token produced by the adapter and must be treated
   * as such by callers; the encode/decode lives in infrastructure.
   */
  listByWorkspace(
    workspaceId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: Edge[]; nextCursor: string | null }>;
  save(edge: Edge, tid: string, tx?: DbTransaction): Promise<void>;
  update(edge: Edge, tid: string, tx?: DbTransaction): Promise<void>;
  softDelete(id: string, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Apply an approved proposal's delta to the edge (RF-10/FR-12), scoped by
   * `workspaceId` and participating in the caller's `tx`.
   */
  applyDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
}
