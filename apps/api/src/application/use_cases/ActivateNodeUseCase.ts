import { isModeratorOrAdmin } from '@vozlab/shared-types';
import { Node } from '../../domain/entities/Node.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type ActivateNodeInput = {
  nodeId: string;
  workspaceId: string;
  tid: string;
  resolverUserId: string;
  resolverHash: string;
  reqId?: string;
};

export class ActivateNodeUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly uow: IUnitOfWork,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: ActivateNodeInput): Promise<Node> {
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

    const isAuthor = input.resolverHash === node.authorHash.toString();
    const isModerator = roles.some((r) => isModeratorOrAdmin(r));
    if (!isAuthor && !isModerator) {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }

    node.changeStatus('ACTIVE');

    await this.uow.runInTransaction(input.tid, async (tx) => {
      await this.nodeRepo.updateStatus(input.nodeId, 'ACTIVE', input.tid, tx);
    });

    await this.eventPublisher.publish('NODE_ACTIVATED', {
      reqId: input.reqId ?? '',
      nodeId: node.id,
      workspaceId: input.workspaceId,
      activatedBy: input.resolverHash,
    });

    return node;
  }
}
