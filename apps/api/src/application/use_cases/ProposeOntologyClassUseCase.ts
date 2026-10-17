import { randomUUID } from 'node:crypto';
import { ProposeOntologyClassInput as ProposeOntologyClassDto } from '@vozlab/shared-types';
import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ProposeOntologyClassInput = ProposeOntologyClassDto & {
  workspaceId: string;
  tid: string;
  proposerHash: string;
  reqId?: string;
};

/**
 * Use Case: propose a new ontology class (RF-09).
 * The proposal is created in `PROPOSED`; it becomes usable once approved.
 */
export class ProposeOntologyClassUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ProposeOntologyClassInput): Promise<OntologyClass> {
    const existing = await this.ontologyRepo.findClassByKey(
      input.systemKey,
      input.workspaceId,
      input.tid
    );
    if (existing) {
      throw new DomainError('ERR_VALIDATION_FAILED');
    }

    const cls = new OntologyClass(
      randomUUID(),
      input.workspaceId,
      input.systemKey,
      input.displayNames,
      input.descriptions ?? {},
      input.parentClassKey ?? null,
      'PROPOSED',
      input.proposerHash
    );

    await this.ontologyRepo.saveClass(cls, input.tid);

    await this.eventPublisher.publish('ONTOLOGY_CLASS_PROPOSED', {
      reqId: input.reqId ?? '',
      classId: cls.id,
      systemKey: cls.systemKey,
      workspaceId: input.workspaceId,
    });

    return cls;
  }
}
