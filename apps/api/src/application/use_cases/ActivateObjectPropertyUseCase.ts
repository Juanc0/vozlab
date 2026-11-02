import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ActivateObjectPropertyInput = {
  propertyId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class ActivateObjectPropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ActivateObjectPropertyInput): Promise<ObjectProperty> {
    const prop = await this.ontologyRepo.findObjectPropertyById(
      input.propertyId,
      input.workspaceId,
      input.tid
    );
    if (!prop) {
      throw new DomainError('ERR_VALIDATION_FAILED', `object property ${input.propertyId} not found`);
    }

    const roles = await this.membershipRepo.getRoles(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );

    const isAuthor = input.resolverHash === prop.proposedBy;
    const isModerator = roles.some((r) => isModeratorOrAdmin(r));
    if (!isAuthor && !isModerator) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    const hasEs = typeof prop.displayNames?.es === 'string' && prop.displayNames.es.trim().length > 0;
    const hasEn = typeof prop.displayNames?.en === 'string' && prop.displayNames.en.trim().length > 0;
    if (!hasEs || !hasEn) {
      throw new DomainError('ERR_LOCALE_INCOMPLETE');
    }

    prop.activate();

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.activateObjectProperty(
        input.propertyId,
        input.workspaceId,
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('OBJECT_PROPERTY_ACTIVATED', {
      reqId: input.reqId ?? '',
      propertyId: prop.id,
      systemKey: prop.systemKey,
      workspaceId: input.workspaceId,
      activatedBy: input.resolverHash,
    });

    return prop;
  }
}
