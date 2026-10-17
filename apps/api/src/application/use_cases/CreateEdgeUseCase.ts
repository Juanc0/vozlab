import { randomUUID } from 'node:crypto';
import { CreateEdgeInput as CreateEdgeDto } from '@vozlab/shared-types';
import { Edge } from '../../domain/entities/Edge.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { resolveAuthorHash } from '../services/resolveAuthorHash.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';

export type CreateEdgeInput = CreateEdgeDto & {
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
};

/**
 * Use Case: connect two existing nodes with a typed, directed edge (RF-08).
 * Validates the relation against the active ontology's domain/range before
 * persisting; the edge is born in `PENDING` (governance applies).
 */
export class CreateEdgeUseCase {
  constructor(
    private readonly edgeRepo: IEdgeRepository,
    private readonly nodeRepo: INodeRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: CreateEdgeInput): Promise<Edge> {
    const source = await this.nodeRepo.findById(input.sourceNodeId, input.tid);
    const target = await this.nodeRepo.findById(input.targetNodeId, input.tid);
    if (!source || !target) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }

    // Domain/range restriction check (RF-08) — only when the ontology knows it.
    const property = await this.ontologyRepo.findObjectProperty(
      input.relationKey,
      input.workspaceId,
      input.tid
    );
    if (property && !property.accepts(source.typeKey, target.typeKey)) {
      throw new DomainError('ERR_INVALID_RELATION_DOMAIN_RANGE');
    }

    const edge = new Edge(
      randomUUID(),
      input.workspaceId,
      input.sourceNodeId,
      input.targetNodeId,
      input.relationKey,
      input.attributes ?? {},
      resolveAuthorHash(input.authorHash, input.authorHash),
      'PENDING'
    );

    await this.edgeRepo.save(edge, input.tid);

    await this.eventPublisher.publish('EDGE_CREATED', {
      reqId: input.reqId ?? '',
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationKey: edge.relationKey,
      workspaceId: edge.workspaceId,
    });

    return edge;
  }
}
