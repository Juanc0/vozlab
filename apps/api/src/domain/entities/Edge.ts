import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';
import type { EdgeStatus } from '@vozlab/shared-types';

/**
 * Edge entity — directed relation between two nodes (RF-08).
 * Pure domain object, no external dependencies.
 *
 * The status vocabulary is declared once, in `@vozlab/shared-types`
 * (`EdgeStatusSchema`); it is re-exported here so the call sites that
 * import it from this entity keep working.
 */
export type { EdgeStatus };

export class Edge {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly sourceNodeId: string,
    public readonly targetNodeId: string,
    public relationKey: string,
    public attributes: Record<string, unknown>,
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

  updateAttributes(delta: Record<string, unknown>): void {
    this.attributes = { ...this.attributes, ...delta };
  }
}
