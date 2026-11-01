import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { Node } from '../../domain/entities/Node.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type AutoActivateNodeInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class AutoActivateNodeUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: AutoActivateNodeInput): Promise<Node> {
    const node = await this.nodeRepo.findByIdInWorkspace(
      input.nodeId,
      input.workspaceId,
      input.tid
    );
    if (!node) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
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
    node.autoActivate(resolver);

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.nodeRepo.updateStatus(input.nodeId, 'ACTIVE', input.tid, tx);
    });

    await this.eventPublisher.publish('NODE_AUTO_ACTIVATED', {
      reqId: input.reqId ?? '',
      nodeId: node.id,
      workspaceId: input.workspaceId,
      activatedBy: input.resolverHash,
    });

    return node;
  }
}