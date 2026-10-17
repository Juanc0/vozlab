import { randomUUID } from 'node:crypto';
import { ProposeDatatypePropertyInput as ProposeDatatypePropertyDto } from '@vozlab/shared-types';
import { DatatypeProperty } from '../../domain/entities/DatatypeProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ProposeDatatypePropertyInput = ProposeDatatypePropertyDto & {
  workspaceId: string;
  tid: string;
  proposerHash: string;
  reqId?: string;
};

/**
 * Use Case: propose a new datatype property (scalar attribute) for an
 * existing ontology class (FR-06). The proposal is created in `PROPOSED`;
 * it becomes usable once approved.
 */
export class ProposeDatatypePropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ProposeDatatypePropertyInput): Promise<DatatypeProperty> {
    // The attribute must be anchored to a class that exists in this workspace.
    const domainClass = await this.ontologyRepo.findClassByKey(
      input.domainClassKey,
      input.workspaceId,
      input.tid
    );
    if (!domainClass) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `unknown domainClassKey ${input.domainClassKey}`
      );
    }

    const prop = new DatatypeProperty(
      randomUUID(),
      input.workspaceId,
      input.systemKey,
      input.displayNames,
      input.descriptions ?? {},
      input.datatype,
      input.allowedValues ?? null,
      input.isRequired,
      input.defaultValue ?? null,
      input.domainClassKey,
      'PROPOSED',
      input.proposerHash
    );

    await this.ontologyRepo.saveDatatypeProperty(prop, input.tid);

    await this.eventPublisher.publish('ONTOLOGY_PROPERTY_PROPOSED', {
      reqId: input.reqId ?? '',
      propertyId: prop.id,
      propertyKind: 'DATATYPE',
      systemKey: prop.systemKey,
      domainClassKey: prop.domainClassKey,
      workspaceId: input.workspaceId,
    });

    return prop;
  }
}
