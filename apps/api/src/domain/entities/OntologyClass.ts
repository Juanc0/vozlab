/**
 * OntologyClass entity — a node/entity type in the workspace metamodel
 * (RF-09). Pure domain object, no external dependencies.
 */
import { DomainError } from '../errors/DomainError.js';

export type OntologyStatus = 'PROPOSED' | 'ACTIVE' | 'REJECTED';

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
    public readonly createdAt: Date = new Date()
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
}
