import { describe, expect, it } from 'vitest';
import { ResolveSourceUseCase } from '../../src/application/use_cases/ResolveSourceUseCase.js';
import {
  DataSourceRecord,
  IDataSourceRepository,
} from '../../src/domain/ports/IDataSourceRepository.js';

const tid = 'tenant-1';

const SOURCE: DataSourceRecord = {
  id: 'source-1',
  workspaceId: 'ws-1',
  sourceKey: 'minutes-2026',
  connectorType: 'MINUTES',
  behaviorProfile: 'BATCH',
  displayName: 'Meeting minutes 2026',
};

function makeUseCase(source: DataSourceRecord | null) {
  const calls: Array<{ sourceKey: string; tid: string }> = [];
  const repo: IDataSourceRepository = {
    async findActiveByKey(sourceKey, tenantId) {
      calls.push({ sourceKey, tid: tenantId });
      return source;
    },
  };
  return { useCase: new ResolveSourceUseCase(repo), calls };
}

describe('ResolveSourceUseCase', () => {
  it('returns the workspace that owns the source', async () => {
    const { useCase, calls } = makeUseCase(SOURCE);

    const result = await useCase.execute({ sourceKey: 'minutes-2026', tid });

    expect(result.workspaceId).toBe('ws-1');
    expect(result.connectorType).toBe('MINUTES');
    expect(result.behaviorProfile).toBe('BATCH');
    expect(calls).toEqual([{ sourceKey: 'minutes-2026', tid }]);
  });

  it('reports an unknown source as ERR_DATA_SOURCE_NOT_FOUND', async () => {
    const { useCase } = makeUseCase(null);

    await expect(
      useCase.execute({ sourceKey: 'unknown', tid })
    ).rejects.toMatchObject({ code: 'ERR_DATA_SOURCE_NOT_FOUND' });
  });
});
