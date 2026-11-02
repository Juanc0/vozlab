import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeprecateOntologyClassInput = {
  id?: string;
  classId?: string;
  migrationTargetKey: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

/**
 * Use Case: deprecate an active ontology class, naming its replacement (G5/G6).
 *
 * Only MODERATOR/ADMIN may deprecate. The domain state machine
 * (`OntologyClass.deprecate`) runs before the write so an invalid transition
 * (or a missing migration target) surfaces as a domain error.
 */
export class DeprecateOntologyClassUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeprecateOntologyClassInput): Promise<OntologyClass> {
    const id = input.id ?? input.classId ?? '';
    const cls = await this.ontologyRepo.findClassById(
      id,
      input.workspaceId,
      input.tid
    );
    if (!cls) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `ontology class ${id} not found`
      );
    }

    const roles = await this.membershipRepo.getRoles(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );
    if (!roles.some((r) => isModeratorOrAdmin(r))) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION when the class
    // is not ACTIVE, ERR_VALIDATION_FAILED when migrationTargetKey is empty.
    cls.deprecate(input.migrationTargetKey);

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.deprecateClass(
        id,
        input.workspaceId,
        input.migrationTargetKey,
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('ONTOLOGY_CLASS_DEPRECATED', {
      reqId: input.reqId ?? '',
      classId: cls.id,
      systemKey: cls.systemKey,
      workspaceId: input.workspaceId,
      deprecatedBy: input.resolverHash,
      migrationTargetKey: input.migrationTargetKey,
    });

    return cls;
  }
}