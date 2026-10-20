import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { DatatypeProperty } from '../../domain/entities/DatatypeProperty.js';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';

export type GetOntologyInput = {
  workspaceId: string;
  tid: string;
};

export type GetOntologyResult = {
  classes: OntologyClass[];
  objectProperties: ObjectProperty[];
  datatypeProperties: DatatypeProperty[];
};

/**
 * Use Case: read the active metamodel of the workspace (FR-06/FR-08/FR-09).
 *
 * Only ACTIVE classes, object properties and datatype properties are
 * exposed; proposals awaiting approval stay invisible to consumers
 * (governance invariant).
 */
export class GetOntologyUseCase {
  constructor(private readonly ontologyRepo: IOntologyRepository) {}

  async execute(input: GetOntologyInput): Promise<GetOntologyResult> {
    const [classes, objectProperties, datatypeProperties] = await Promise.all([
      this.ontologyRepo.findActiveClasses(input.workspaceId, input.tid),
      this.ontologyRepo.findActiveObjectProperties(input.workspaceId, input.tid),
      this.ontologyRepo.findActiveDatatypeProperties(input.workspaceId, input.tid),
    ]);

    return {
      classes,
      objectProperties,
      // Governance invariant, repeated on purpose: the adapter already
      // filters on `status = 'ACTIVE'`, and the check here keeps a wider
      // adapter from leaking a proposal into the dynamic form.
      datatypeProperties: datatypeProperties.filter((prop) => prop.status === 'ACTIVE'),
    };
  }
}
