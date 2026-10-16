import { Edge } from '../entities/Edge.js';

/**
 * Port: Edge persistence contract. Scoped by `tid` (physical tenant DB).
 */
export interface IEdgeRepository {
  findById(id: string, tid: string): Promise<Edge | null>;
  findByWorkspace(workspaceId: string, tid: string): Promise<Edge[]>;
  save(edge: Edge, tid: string, tx?: any): Promise<void>;
  softDelete(id: string, tid: string, tx?: any): Promise<void>;
}
