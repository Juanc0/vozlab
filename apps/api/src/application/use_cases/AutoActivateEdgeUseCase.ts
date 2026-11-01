import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { Edge } from '../../domain/entities/Edge.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type AutoActivateEdgeInput = {
  edgeId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class AutoActivateEdgeUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: AutoActivateEdgeInput): Promise<Edge> {
    const edge = await this.edgeRepo.findByIdInWorkspace(
      input.edgeId,
      input.workspaceId,
      input.tid
    );
    if (!edge) {
      throw new DomainError('ERR_EDGE_NOT_FOUND');
    }

    const roles = await this.membershipRepo.getRoles(
      input.resolverUserId,
      input.workspaceId,
      input.tid
    );
    if (!roles.some((r) => isModeratorOrAdmin(r))) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    const resolver = AuthorHash.fromString(input.resolverHash);
    edge.autoActivate(resolver);

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.edgeRepo.updateStatus(input.edgeId, 'ACTIVE', input.tid, tx);
    });

    await this.eventPublisher.publish('EDGE_AUTO_ACTIVATED', {
      reqId: input.reqId ?? '',
      edgeId: edge.id,
      workspaceId: input.workspaceId,
      activatedBy: input.resolverHash,
    });

    return edge;
  }
}