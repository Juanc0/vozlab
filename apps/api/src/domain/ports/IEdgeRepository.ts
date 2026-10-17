import { Edge } from '../entities/Edge.js';

/**
 * Port: Edge persistence contract. Scoped by `tid` (physical tenant DB).
 */
export interface IEdgeRepository {
  findById(id: string, tid: string): Promise<Edge | null>;
  findByWorkspace(workspaceId: string, tid: string): Promise<Edge[]>;
  save(edge: Edge, tid: string, tx?: any): Promise<void>;
  softDelete(id: string, tid: string, tx?: any): Promise<void>;
  /**
   * Apply an approved proposal's delta to the edge (RF-10/FR-12), scoped by
   * `workspaceId` and participating in the caller's `tx`.
   */
  applyDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: any
  ): Promise<void>;
}
