import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeprecateObjectPropertyInput = {
  id?: string;
  propertyId?: string;
  migrationTargetKey: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class DeprecateObjectPropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeprecateObjectPropertyInput): Promise<ObjectProperty> {
    const id = input.id ?? input.propertyId ?? '';
    const prop = await this.ontologyRepo.findObjectPropertyById(
      id,
      input.workspaceId,
      input.tid
    );
    if (!prop) {
      throw new DomainError(
        'ERR_OBJECT_PROPERTY_NOT_FOUND',
        `object property ${id} not found`
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

    prop.deprecate(input.migrationTargetKey);

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.deprecateObjectProperty(
        id,
        input.workspaceId,
        input.migrationTargetKey,
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('ONTOLOGY_PROPERTY_DEPRECATED', {
      reqId: input.reqId ?? '',
      propertyId: prop.id,
      systemKey: prop.systemKey,
      workspaceId: input.workspaceId,
      deprecatedBy: input.resolverHash,
      migrationTargetKey: input.migrationTargetKey,
    });

    return prop;
  }
}