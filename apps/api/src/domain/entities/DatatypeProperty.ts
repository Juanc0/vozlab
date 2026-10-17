import { OntologyStatus } from './OntologyClass.js';
import { DomainError } from '../errors/DomainError.js';

/**
 * DatatypeProperty entity — a scalar attribute of an ontology class (RF-06).
 * Drives the dynamic node-creation form. Pure domain object.
 */
export type DatatypeKind = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export class DatatypeProperty {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string | null,
    public readonly systemKey: string,
    public displayNames: Record<string, string>,
    public descriptions: Record<string, string> = {},
    public datatype: DatatypeKind = 'string',
    public allowedValues: string[] | null = null,
    public isRequired: boolean = false,
    public defaultValue: unknown = null,
    public readonly domainClassKey: string,
    public status: OntologyStatus = 'PROPOSED',
    public readonly proposedBy: string = 'unknown',
    public readonly createdAt: Date = new Date()
  ) {}

  /** A value is valid when it satisfies the datatype and the enum domain. */
  validateValue(value: unknown): boolean {
    if (this.isRequired && (value === null || value === undefined)) return false;
    if (value === null || value === undefined) return true;

    switch (this.datatype) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return typeof value === 'string' && !Number.isNaN(Date.parse(value));
      case 'enum':
        return (
          Array.isArray(this.allowedValues) &&
          this.allowedValues.includes(String(value))
        );
      default:
        return false;
    }
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
