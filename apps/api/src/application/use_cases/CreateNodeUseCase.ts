import { randomUUID } from 'node:crypto';
import { Node } from '../../domain/entities/Node.js';
import { AuthorHash } from '../../domain/value_objects/AuthorHash.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import { CreateNodeInput } from '@vozlab/shared-types';

/**
 * Use Case: Create a new Node in the knowledge graph.
 */
export class CreateNodeUseCase {
  constructor(
    private nodeRepo: INodeRepository,
    private eventPublisher: IEventPublisher
  ) {}

  async execute(
    input: CreateNodeInput & {
      workspaceId: string;
      authorHash: string;
      tid: string;
      reqId?: string;
    }
  ): Promise<Node> {
    const authorHashVO = AuthorHash.fromRawOrIdentity(input.authorHash, 'default-salt');

    const node = new Node(
      randomUUID(),
      input.workspaceId,
      input.typeKey,
      input.title,
      input.description ?? null,
      input.attributes ?? {},
      authorHashVO,
      'PENDING'
    );

    // Scope the write to the tenant's physical database (tid).
    await this.nodeRepo.save(node, input.tid);

    // Publish async event (`stream:node_created`) for the Relacionador worker.
    // The correlation id travels with the event for end-to-end tracing.
    await this.eventPublisher.publish('NODE_CREATED', {
      reqId: input.reqId ?? '',
      nodeId: node.id,
      workspaceId: node.workspaceId,
      typeKey: node.typeKey,
      title: node.title,
    });

    return node;
  }
}