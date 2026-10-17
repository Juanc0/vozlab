import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';

export type GetOntologyInput = {
  workspaceId: string;
  tid: string;
};

export type GetOntologyResult = {
  classes: OntologyClass[];
  objectProperties: ObjectProperty[];
};

/**
 * Use Case: read the active metamodel of the workspace (FR-06/FR-08/FR-09).
 *
 * Only ACTIVE classes and object properties are exposed; proposals awaiting
 * approval stay invisible to consumers (governance invariant).
 */
export class GetOntologyUseCase {
  constructor(private readonly ontologyRepo: IOntologyRepository) {}

  async execute(input: GetOntologyInput): Promise<GetOntologyResult> {
    const [classes, objectProperties] = await Promise.all([
      this.ontologyRepo.findActiveClasses(input.workspaceId, input.tid),
      this.ontologyRepo.findActiveObjectProperties(input.workspaceId, input.tid),
    ]);

    return { classes, objectProperties };
  }
}
