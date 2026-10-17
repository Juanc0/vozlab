import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ActivateOntologyClassInput = {
  classId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

/**
 * Use Case: promote a proposed ontology class to `ACTIVE` (FR-09).
 *
 * Only ADMIN / MODERATOR may activate; the role is resolved from the tenant's
 * membership table (never trusted from the request body). The domain state
 * machine (`OntologyClass.activate`) runs before the write so an invalid
 * transition surfaces as `ERR_INVALID_STATE_TRANSITION`.
 */
export class ActivateOntologyClassUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ActivateOntologyClassInput): Promise<OntologyClass> {
    const role = await this.membershipRepo.getRole(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );
    if (!isModeratorOrAdmin(role)) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    const cls = await this.ontologyRepo.findClassById(
      input.classId,
      input.workspaceId,
      input.tid
    );
    if (!cls) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `ontology class ${input.classId} not found`
      );
    }

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION when the
    // class is not PROPOSED, before any persistence happens.
    cls.activate();

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.activateClass(input.classId, input.workspaceId, input.tid, tx);
    });

    // Post-commit, best-effort publication.
    await this.eventPublisher.publish('ONTOLOGY_CLASS_ACTIVATED', {
      reqId: input.reqId ?? '',
      classId: cls.id,
      systemKey: cls.systemKey,
      workspaceId: input.workspaceId,
      activatedBy: input.resolverHash,
    });

    return cls;
  }
}
