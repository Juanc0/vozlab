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
    public readonly createdAt: Date = new Date()
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
}
