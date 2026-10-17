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
  /**
   * List non-deleted nodes of a workspace using keyset (cursor) pagination
   * ordered by `createdAt DESC, id DESC` (NFR-04, O(1) — never OFFSET).
   *
   * `cursor` is an opaque token produced by the adapter and must be treated
   * as such by callers; the encode/decode lives in infrastructure.
   */
  listByWorkspace(
    workspaceId: string,
    opts: { limit: number; cursor?: string },
    tid: string
  ): Promise<{ items: Node[]; nextCursor: string | null }>;
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