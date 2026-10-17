import { randomUUID } from 'node:crypto';
import { ProposeObjectPropertyInput as ProposeObjectPropertyDto } from '@vozlab/shared-types';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ProposeObjectPropertyInput = ProposeObjectPropertyDto & {
  workspaceId: string;
  tid: string;
  proposerHash: string;
  reqId?: string;
};

/**
 * Use Case: propose a new object property (typed relation with domain/range)
 * between two existing ontology classes (FR-08). The proposal is created in
 * `PROPOSED`; it becomes usable once approved.
 */
export class ProposeObjectPropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ProposeObjectPropertyInput): Promise<ObjectProperty> {
    // Both endpoint classes must exist in this workspace (RF-08).
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

    const rangeClass = await this.ontologyRepo.findClassByKey(
      input.rangeClassKey,
      input.workspaceId,
      input.tid
    );
    if (!rangeClass) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `unknown rangeClassKey ${input.rangeClassKey}`
      );
    }

    const prop = new ObjectProperty(
      randomUUID(),
      input.workspaceId,
      input.systemKey,
      input.displayNames,
      input.descriptions ?? {},
      input.domainClassKey,
      input.rangeClassKey,
      input.isDirectional,
      input.isSymmetric,
      input.allowsSelfRelation,
      'PROPOSED',
      input.proposerHash
    );

    await this.ontologyRepo.saveObjectProperty(prop, input.tid);

    await this.eventPublisher.publish('ONTOLOGY_PROPERTY_PROPOSED', {
      reqId: input.reqId ?? '',
      propertyId: prop.id,
      propertyKind: 'OBJECT',
      systemKey: prop.systemKey,
      domainClassKey: prop.domainClassKey,
      rangeClassKey: prop.rangeClassKey,
      workspaceId: input.workspaceId,
    });

    return prop;
  }
}
