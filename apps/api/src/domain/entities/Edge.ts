import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';

/**
 * Edge entity — directed relation between two nodes (RF-08).
 * Pure domain object, no external dependencies.
 */
export type EdgeStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'REJECTED';

export class Edge {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly sourceNodeId: string,
    public readonly targetNodeId: string,
    public relationKey: string,
    public attributes: Record<string, any>,
    public readonly authorHash: AuthorHash,
    public status: EdgeStatus = 'PENDING',
    public communityScore: number = 0,
    public readonly createdAt: Date = new Date(),
    public deletedAt: Date | null = null
  ) {}

  /** Enforce the edge state machine. */
  changeStatus(newStatus: EdgeStatus): void {
    const validTransitions: Record<EdgeStatus, EdgeStatus[]> = {
      DRAFT: ['PENDING', 'ACTIVE'],
      PENDING: ['ACTIVE', 'REJECTED'],
      ACTIVE: ['REJECTED'],
      REJECTED: [],
    };
    if (!validTransitions[this.status].includes(newStatus)) {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot transition edge from ${this.status} to ${newStatus}`
      );
    }
    this.status = newStatus;
  }

  updateAttributes(delta: Record<string, any>): void {
    this.attributes = { ...this.attributes, ...delta };
  }

  softDelete(): void {
    this.deletedAt = new Date();
  }
}
