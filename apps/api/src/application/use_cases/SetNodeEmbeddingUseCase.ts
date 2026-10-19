import { EMBEDDING_DIMENSIONS } from '@vozlab/shared-types';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';

export type SetNodeEmbeddingInput = {
  nodeId: string;
  workspaceId: string;
  embedding: number[];
  model: string;
  tid: string;
};

/**
 * Use Case: persist the embedding vector computed by the embedder worker
 * (FR-18, ADR-0020).
 *
 * The API stays the only writer to tenant PostgreSQL: the worker computes the
 * vector and calls `PUT /api/v1/nodes/:id/embedding`; this use case validates
 * it and hands the write to the repository.
 *
 * Validation is deliberately defensive — the Zod schema at the HTTP boundary
 * already enforces the shape, but the use case is the only place that knows
 * the deployment's embedding model, and it must hold for every caller:
 *   - the vector must have exactly `EMBEDDING_DIMENSIONS` finite values;
 *   - the model must match the deployment's configured model, otherwise the
 *     vector would silently live in a different embedding space than the one
 *     the Relator queries.
 *
 * A missing, soft-deleted or foreign-workspace node is reported as
 * `404 ERR_NODE_NOT_FOUND` (ADR-0008 — existence is not leaked).
 */
export class SetNodeEmbeddingUseCase {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly expectedModel: string
  ) {}

  async execute(input: SetNodeEmbeddingInput): Promise<void> {
    if (input.model !== this.expectedModel) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `unknown embedding model "${input.model}"`
      );
    }

    if (input.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        `embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions`
      );
    }

    if (!input.embedding.every((value) => Number.isFinite(value))) {
      throw new DomainError(
        'ERR_VALIDATION_FAILED',
        'embedding values must be finite numbers'
      );
    }

    const updated = await this.nodeRepo.setEmbedding(
      input.nodeId,
      input.workspaceId,
      input.embedding,
      input.model,
      input.tid
    );

    if (!updated) {
      throw new DomainError('ERR_NODE_NOT_FOUND');
    }
  }
}
