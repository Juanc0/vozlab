import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type RejectOntologyClassInput = {
  classId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

/**
 * Use Case: reject a proposed ontology class (FR-09 / G4).
 *
 * The proposer (author) of the class or any MODERATOR/ADMIN may reject it.
 * The domain state machine (`OntologyClass.reject`) runs before the write so
 * an invalid transition surfaces as `ERR_INVALID_STATE_TRANSITION`.
 */
export class RejectOntologyClassUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: RejectOntologyClassInput): Promise<OntologyClass> {
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

    const roles = await this.membershipRepo.getRoles(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );

    const isAuthor = input.resolverHash === cls.proposedBy;
    const isModerator = roles.some((r) => isModeratorOrAdmin(r));
    if (!isAuthor && !isModerator) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION when the
    // class is not PROPOSED, before any persistence happens.
    cls.reject();

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.rejectClass(input.classId, input.workspaceId, input.tid, tx);
    });

    // Post-commit, best-effort publication.
    await this.eventPublisher.publish('ONTOLOGY_CLASS_REJECTED', {
      reqId: input.reqId ?? '',
      classId: cls.id,
      systemKey: cls.systemKey,
      workspaceId: input.workspaceId,
      rejectedBy: input.resolverHash,
    });

    return cls;
  }
}