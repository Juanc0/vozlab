import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { DatatypeProperty } from '../../domain/entities/DatatypeProperty.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type RejectDatatypePropertyInput = {
  propertyId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class RejectDatatypePropertyUseCase {
  constructor(
    private readonly ontologyRepo: IOntologyRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: RejectDatatypePropertyInput): Promise<DatatypeProperty> {
    const prop = await this.ontologyRepo.findDatatypePropertyById(
      input.propertyId,
      input.workspaceId,
      input.tid
    );
    if (!prop) {
      throw new DomainError('ERR_VALIDATION_FAILED', `datatype property ${input.propertyId} not found`);
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

    prop.reject();

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.ontologyRepo.rejectDatatypeProperty(
        input.propertyId,
        input.workspaceId,
        input.tid,
        tx
      );
    });

    await this.eventPublisher.publish('DATATYPE_PROPERTY_REJECTED', {
      reqId: input.reqId ?? '',
      propertyId: prop.id,
      systemKey: prop.systemKey,
      workspaceId: input.workspaceId,
      rejectedBy: input.resolverHash,
    });

    return prop;
  }
}
