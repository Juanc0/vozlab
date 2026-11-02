import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { DatatypeProperty } from '../../domain/entities/DatatypeProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type DeprecateDatatypePropertyInput = {
  id?: string;
  propertyId?: string;
  migrationTargetKey: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class DeprecateDatatypePropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: DeprecateDatatypePropertyInput): Promise<DatatypeProperty> {
    const id = input.id ?? input.propertyId ?? '';
    const prop = await this.ontologyRepo.findDatatypePropertyById(
      id,
      input.workspaceId,
      input.tid
    );
    if (!prop) {
      throw new DomainError(
        'ERR_DATATYPE_PROPERTY_NOT_FOUND',
        `datatype property ${id} not found`
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
      await this.ontologyRepo.deprecateDatatypeProperty(
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