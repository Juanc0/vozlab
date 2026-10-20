import { AuthorHash } from '../value_objects/AuthorHash.js';
import { DomainError } from '../errors/DomainError.js';

export type TargetType = 'NODE' | 'EDGE' | 'ONTOLOGY';
export type ProposalStatus = 'PENDING' | 'APPROVED_BY_AUTHOR' | 'REJECTED_BY_AUTHOR' | 'AUTO_APPLIED';

/**
 * The kind of a proposal (ADR-0026).
 *
 * `EDIT` applies an attribute delta to the target; `MERGE` folds the target
 * node into another one. The kind is stored with the proposal, so it is
 * never inferred from the shape of the payload.
 */
export type ProposalKind = 'EDIT' | 'MERGE';

/**
 * Domain Entity: EditProposal (Pull Request style on knowledge graph).
 *
 * Encapsulates the proposal state machine:
 * PENDING -> APPROVED_BY_AUTHOR (Merge)
 * PENDING -> REJECTED_BY_AUTHOR (Reject)
 * PENDING -> AUTO_APPLIED (Moderator override > 14d inactivity + score >= 10)
 */
export class EditProposal {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly targetId: string,
    public readonly targetType: TargetType,
    public readonly proposedChanges: Record<string, any>,
    public readonly proposerHash: AuthorHash,
    public status: ProposalStatus = 'PENDING',
    public justification: string | null = null,
    public communityScore: number = 0,
    public resolvedBy: AuthorHash | null = null,
    public resolvedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
    public readonly kind: ProposalKind = 'EDIT'
  ) {}

  /**
   * The node that survives this proposal when it is a merge (ADR-0026), or
   * null for an edit proposal.
   */
  public get mergeTargetId(): string | null {
    if (this.kind !== 'MERGE') return null;
    const value = this.proposedChanges?.mergeIntoNodeId;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /**
   * Author/Maintainer approves the proposal (Merge).
   */
  public approve(resolverHash: AuthorHash): void {
    if (this.status !== 'PENDING') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot approve proposal in status ${this.status}`
      );
    }
    this.status = 'APPROVED_BY_AUTHOR';
    this.resolvedBy = resolverHash;
    this.resolvedAt = new Date();
  }

  /**
   * Author/Maintainer rejects the proposal.
   */
  public reject(resolverHash: AuthorHash): void {
    if (this.status !== 'PENDING') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot reject proposal in status ${this.status}`
      );
    }
    this.status = 'REJECTED_BY_AUTHOR';
    this.resolvedBy = resolverHash;
    this.resolvedAt = new Date();
  }

  /**
   * Moderator unlocks and applies proposal due to maintainer inactivity (>14 days, score >= 10).
   */
  public autoApply(moderatorHash: AuthorHash): void {
    if (this.status !== 'PENDING') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot auto-apply proposal in status ${this.status}`
      );
    }
    const daysSinceCreation = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 14 || this.communityScore < 10) {
      throw new DomainError(
        'ERR_UNMET_AUTO_APPLY_CRITERIA',
        `Requires score >= 10 (current: ${this.communityScore}) and age >= 14 days (current: ${Math.floor(daysSinceCreation)} days)`
      );
    }
    this.status = 'AUTO_APPLIED';
    this.resolvedBy = moderatorHash;
    this.resolvedAt = new Date();
  }
}