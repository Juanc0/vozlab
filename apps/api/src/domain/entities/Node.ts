import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';
import type { NodeStatus } from '@vozlab/shared-types';

/**
 * Node entity — pure domain object with no external dependencies.
 * Enforces state transitions: DRAFT -> PENDING -> ACTIVE -> MERGED | DEPRECATED | REJECTED
 *
 * The status vocabulary is declared once, in `@vozlab/shared-types`
 * (`NodeStatusSchema`); it is re-exported here so the call sites that
 * import it from this entity keep working.
 */
export type { NodeStatus };

export class Node {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly typeKey: string,
    public title: string,
    public description: string | null,
    public attributes: Record<string, unknown>,
    public readonly authorHash: AuthorHash,
    public status: NodeStatus,
    public communityScore: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    /**
     * ADR-0026: the node that survives when this node is merged away.
     * NULL for every node that was never merged.
     */
    public mergedIntoId: string | null = null
  ) {}

  /**
   * Transition the node to a new status, enforcing valid state machine rules.
   */
  changeStatus(newStatus: NodeStatus): void {
    const validTransitions: Record<NodeStatus, NodeStatus[]> = {
      DRAFT: ['PENDING', 'ACTIVE'],
      // ADR-0026: a node can be merged away while it is still PENDING — it
      // is the only state a node reaches today (no route activates a node),
      // so forbidding the transition would make merges unusable.
      PENDING: ['ACTIVE', 'REJECTED', 'MERGED'],
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
   * Whether the node can be merged away (ADR-0026): `PENDING` and `ACTIVE`
   * can, the terminal states (`MERGED`, `DEPRECATED`, `REJECTED`) cannot.
   *
   * The rule is checked twice: when the merge proposal is created and again
   * when it is applied, because the node can change in between.
   */
  public get isMergeable(): boolean {
    return this.status === 'PENDING' || this.status === 'ACTIVE';
  }

  /**
   * Merge this node into `targetId` (ADR-0026): the node stops being a graph
   * citizen and points at the node that survives. The merge itself is applied
   * by the API; this method only records the decision.
   */
  public mergeInto(targetId: string): void {
    if (targetId === this.id) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'a node cannot be merged into itself'
      );
    }
    this.changeStatus('MERGED');
    this.mergedIntoId = targetId;
  }

  /**
   * Absorb a duplicate that was merged into this node (ADR-0026): the
   * attributes the duplicate has and this node does not are adopted — the
   * survivor's own values always win — and the support for the duplicate
   * carries over.
   */
  public absorb(source: Node): void {
    if (source.id === this.id) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'a node cannot absorb itself'
      );
    }
    this.attributes = { ...source.attributes, ...this.attributes };
    this.communityScore += source.communityScore;
    this.updatedAt = new Date();
  }

  /**
   * Apply a delta of attribute changes (used by edit proposals).
   */
  updateAttributes(delta: Record<string, unknown>): void {
    this.attributes = { ...this.attributes, ...delta };
    this.updatedAt = new Date();
  }
}