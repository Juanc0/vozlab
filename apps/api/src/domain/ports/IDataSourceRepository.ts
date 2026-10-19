import type { BehaviorProfile, ConnectorType } from '@vozlab/shared-types';

/**
 * A row of the API-owned source registry (ADR-0009, ADR-0025).
 *
 * The registry maps an external `sourceId` to the workspace that owns it and
 * carries the per-source behavior profile the ingestion worker needs.
 */
export interface DataSourceRecord {
  id: string;
  workspaceId: string;
  sourceKey: string;
  connectorType: ConnectorType;
  behaviorProfile: BehaviorProfile;
  displayName: string;
}

/**
 * Port: data-source registry persistence contract.
 * Implementations live in infrastructure/ (e.g. DrizzleDataSourceRepository).
 *
 * Every method is scoped to a tenant (`tid`): the resolution route resolves
 * the physical tenant database from the token, so a source of another tenant
 * is never visible.
 */
export interface IDataSourceRepository {
  /**
   * Find the first ACTIVE source with this key inside the tenant.
   * Returns `null` when no active source matches.
   */
  findActiveByKey(sourceKey: string, tid: string): Promise<DataSourceRecord | null>;
}
