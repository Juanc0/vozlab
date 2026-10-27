import { DomainError } from '../../domain/errors/DomainError.js';
import { IDataSourceRepository } from '../../domain/ports/IDataSourceRepository.js';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import { randomUUID } from 'node:crypto';
import { maskPayload } from '../../shared/pii/mask.js';

export type IngestSourceInput = {
  sourceKey: string;
  payload: unknown;
  tid: string;
  workspaceId?: string;
};

/**
 * Use Case: ingest a raw payload from an external source (ADR-0009,
 * ADR-0025, ADR-0035).
 *
 * Resolves the source in the tenant's registry, then publishes the payload
 * to `stream:source_raw` for the Extractor worker. PII masking is applied
 * by the Extractor before any LLM call; the producer passes the raw payload
 * so the worker can mask according to its own policy.
 */
export class IngestSourceUseCase {
  constructor(
    private readonly dataSourceRepo: IDataSourceRepository,
    private readonly eventPublisher: IEventPublisher
  ) {}

  async execute(input: IngestSourceInput): Promise<{ correlationId: string }> {
    const source = await this.dataSourceRepo.findActiveByKey(
      input.sourceKey,
      input.tid
    );

    if (!source) {
      throw new DomainError('ERR_DATA_SOURCE_NOT_FOUND');
    }

    const correlationId = randomUUID();

    await this.eventPublisher.publish('SOURCE_RAW', {
      tid: input.tid,
      workspaceId: source.workspaceId,
      sourceKey: input.sourceKey,
      payload: maskPayload(input.payload),
      correlationId,
    });

    return { correlationId };
  }
}