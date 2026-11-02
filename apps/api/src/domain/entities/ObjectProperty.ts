import { OntologyStatus } from './OntologyClass.js';
import { DomainError } from '../errors/DomainError.js';

/**
 * ObjectProperty entity — a typed, directed relation between two classes,
 * with domain (source) and range (target) restrictions (RF-08).
 * Pure domain object.
 */
export class ObjectProperty {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string | null,
    public readonly systemKey: string,
    public displayNames: Record<string, string>,
    public descriptions: Record<string, string> = {},
    public readonly domainClassKey: string,
    public readonly rangeClassKey: string,
    public isDirectional: boolean = true,
    public isSymmetric: boolean = false,
    public allowsSelfRelation: boolean = false,
    public status: OntologyStatus = 'PROPOSED',
    // no maintainer: an empty hash can never equal a resolved pseudonym
    public readonly proposedBy: string = '',
    public readonly createdAt: Date = new Date(),
    public migrationTargetKey: string | null = null,
    public readonly communityScore: number = 0
  ) {}

  /**
   * Domain/range check for a candidate edge (RF-08).
   * `sourceTypeKey` / `targetTypeKey` are the `system_key`s of the endpoint nodes.
   */
  accepts(sourceTypeKey: string, targetTypeKey: string): boolean {
    if (!this.allowsSelfRelation && sourceTypeKey === targetTypeKey) {
      return false;
    }
    if (this.isSymmetric) {
      return (
        (sourceTypeKey === this.domainClassKey &&
          targetTypeKey === this.rangeClassKey) ||
        (sourceTypeKey === this.rangeClassKey &&
          targetTypeKey === this.domainClassKey)
      );
    }
    return (
      sourceTypeKey === this.domainClassKey &&
      targetTypeKey === this.rangeClassKey
    );
  }

  activate(): void {
    if (this.status !== 'PROPOSED') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot activate property in status ${this.status}`
      );
    }
    this.status = 'ACTIVE';
  }

  reject(): void {
    if (this.status !== 'PROPOSED') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot reject property in status ${this.status}`
      );
    }
    this.status = 'REJECTED';
  }

  deprecate(migrationTargetKey: string): void {
    if (this.status !== 'ACTIVE') {
      throw new DomainError(
        'ERR_INVALID_STATE_TRANSITION',
        `cannot deprecate property in status ${this.status}`
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
}
