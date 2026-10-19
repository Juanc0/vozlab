import { DomainError } from '../../domain/errors/DomainError.js';
import { IDataSourceRepository } from '../../domain/ports/IDataSourceRepository.js';

export type ResolveSourceInput = {
  sourceKey: string;
  tid: string;
};

/**
 * Use Case: resolve the workspace that owns an ingestion source
 * (ADR-0009, ADR-0025).
 *
 * The worker never chooses a workspace: it asks the API, which looks the
 * source up in the tenant's own registry. An unknown or inactive source is
 * reported as `404 ERR_DATA_SOURCE_NOT_FOUND` — the same "existence is not
 * leaked" rule as every other resource (ADR-0008).
 */
export class ResolveSourceUseCase {
  constructor(private readonly dataSourceRepo: IDataSourceRepository) {}

  async execute(input: ResolveSourceInput) {
    const source = await this.dataSourceRepo.findActiveByKey(
      input.sourceKey,
      input.tid
    );

    if (!source) {
      throw new DomainError('ERR_DATA_SOURCE_NOT_FOUND');
    }

    return source;
  }
}
