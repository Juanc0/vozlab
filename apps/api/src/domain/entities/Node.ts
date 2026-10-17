import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';

/**
 * Node entity — pure domain object with no external dependencies.
 * Enforces state transitions: DRAFT -> PENDING -> ACTIVE -> MERGED | DEPRECATED | REJECTED
 */
export type NodeStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'MERGED' | 'DEPRECATED' | 'REJECTED';

export class Node {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly typeKey: string,
    public title: string,
    public description: string | null,
    public attributes: Record<string, any>,
    public readonly authorHash: AuthorHash,
    public status: NodeStatus,
    public communityScore: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  /**
   * Transition the node to a new status, enforcing valid state machine rules.
   */
  changeStatus(newStatus: NodeStatus): void {
    const validTransitions: Record<NodeStatus, NodeStatus[]> = {
      DRAFT: ['PENDING', 'ACTIVE'],
      PENDING: ['ACTIVE', 'REJECTED'],
      ACTIVE: ['MERGED', 'DEPRECATED'],
      MERGED: [],
      DEPRECATED: [],
      REJECTED: [],
    };

    if (!validTransitions[this.status].includes(newStatus)) {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot transition from ${this.status} to ${newStatus}`
      );
    }
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /**
   * Apply a delta of attribute changes (used by edit proposals).
   */
  updateAttributes(delta: Record<string, any>): void {
    this.attributes = { ...this.attributes, ...delta };
    this.updatedAt = new Date();
  }
}