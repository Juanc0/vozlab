import { Node } from '../entities/Node.js';

/**
 * Port: Node persistence contract.
 * Implementations live in infrastructure/ (e.g. DrizzleNodeRepository).
 *
 * Every method is scoped to a tenant (`tid`) to guarantee physical
 * multi-tenant isolation — the pool manager resolves a dedicated
 * connection per tenant.
 */
export interface INodeRepository {
  findById(id: string, tid: string): Promise<Node | null>;
  save(node: Node, tid: string, tx?: any): Promise<void>;
  update(node: Node, tid: string, tx?: any): Promise<void>;
  applyDelta(
    targetId: string,
    proposedChanges: Record<string, any>,
    workspaceId: string,
    tid: string,
    tx?: any
  ): Promise<void>;
}