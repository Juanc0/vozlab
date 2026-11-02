/**
 * OntologyClass entity — a node/entity type in the workspace metamodel
 * (RF-09). Pure domain object, no external dependencies.
 */
import { DomainError } from '../errors/DomainError.js';
import type { PropertyStatus } from '@vozlab/shared-types';

/**
 * The status of an ontology element (class, datatype property, object
 * property).
 *
 * The vocabulary is declared once, in `@vozlab/shared-types`, where it is
 * called `PropertyStatus` (the shared name); `OntologyStatus` is only an
 * alias of it, kept for the callers that already import it from this
 * entity.
 */
export type OntologyStatus = PropertyStatus;

export class OntologyClass {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string | null,
    public readonly systemKey: string,
    public displayNames: Record<string, string>,
    public descriptions: Record<string, string> = {},
    public parentClassKey: string | null = null,
    public status: OntologyStatus = 'PROPOSED',
    // no maintainer: an empty hash can never equal a resolved pseudonym
    public readonly proposedBy: string = '',
    public readonly createdAt: Date = new Date(),
    public migrationTargetKey: string | null = null,
    public readonly communityScore: number = 0
  ) {}

  /** Institutional/community approval promotes a proposal to the active ontology. */
  activate(): void {
    if (this.status !== 'PROPOSED') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot activate class in status ${this.status}`
      );
    }
    this.status = 'ACTIVE';
  }

  reject(): void {
    if (this.status !== 'PROPOSED') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot reject class in status ${this.status}`
      );
    }
    this.status = 'REJECTED';
  }

  /** Mark an active class as deprecated, naming its replacement (G5/G6). */
  deprecate(migrationTargetKey: string): void {
    if (this.status !== 'ACTIVE') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot deprecate class in status ${this.status}`
      );
    }
    if (!migrationTargetKey || migrationTargetKey.trim() === '') {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'migrationTargetKey is required'
      );
    }
    this.status = 'DEPRECATED';
    this.migrationTargetKey = migrationTargetKey;
  }

  /**
   * Quorum check (G3): activation requires at least `threshold` distinct
   * institutional supporters. Anonymous event members are excluded by the
   * caller (they never appear in `supporterHashes`). Distinctness is by
   * `author_hash` (the counting unit), so duplicate hashes collapse.
   */
  canActivate(supporterHashes: string[], threshold = 3): boolean {
    return new Set(supporterHashes).size >= threshold;
  }
}
