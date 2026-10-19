import { and, eq } from 'drizzle-orm';
import { dataSources } from '@vozlab/database';
import type { BehaviorProfile, ConnectorType } from '@vozlab/shared-types';
import {
  DataSourceRecord,
  IDataSourceRepository,
} from '../../../domain/ports/IDataSourceRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';

/**
 * DrizzleDataSourceRepository: adapter for the API-owned source registry
 * (`meta.data_sources`, ADR-0009, ADR-0025).
 *
 * The lookup is scoped to the tenant's physical database, so a source of
 * another tenant can never be resolved.
 */
export class DrizzleDataSourceRepository implements IDataSourceRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  async findActiveByKey(
    sourceKey: string,
    tid: string
  ): Promise<DataSourceRecord | null> {
    const db = await this.poolManager.getDb(tid);

    const [row] = await db
      .select({
        id: dataSources.id,
        workspaceId: dataSources.workspaceId,
        sourceKey: dataSources.sourceKey,
        connectorType: dataSources.connectorType,
        behaviorProfile: dataSources.behaviorProfile,
        displayName: dataSources.displayName,
      })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.sourceKey, sourceKey),
          eq(dataSources.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      sourceKey: row.sourceKey,
      connectorType: row.connectorType as ConnectorType,
      behaviorProfile: row.behaviorProfile as BehaviorProfile,
      displayName: row.displayName,
    };
  }
}
