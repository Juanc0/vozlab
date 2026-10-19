import { z } from 'zod';

export const ConnectorTypeSchema = z.enum([
  'MINUTES',
  'SURVEY',
  'INBOX',
  'OPEN_COMMENT',
]);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

/** Behavior profile selected by the connector type (one worker, many profiles). */
export const BehaviorProfileSchema = z.enum(['BATCH', 'STREAM']);
export type BehaviorProfile = z.infer<typeof BehaviorProfileSchema>;

/** Envelope produced by the ingestion gateway and consumed by the Extractor. */
export const RawSourceRecordSchema = z.object({
  sourceId: z.string().min(1),
  connectorType: ConnectorTypeSchema,
  channelName: z.string().min(1),
  rawContent: z.string().min(1),
  // NOTE: no workspaceId — the API resolves it from the source registry.
});
export type RawSourceRecord = z.infer<typeof RawSourceRecordSchema>;

/**
 * Query of the source resolution route
 * (`GET /api/v1/ingestion/resolve-source`, ADR-0025).
 */
export const ResolveSourceQuerySchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required').max(200),
});
export type ResolveSourceQueryInput = z.infer<typeof ResolveSourceQuerySchema>;

/**
 * Answer of the source resolution route: the workspace a source belongs to,
 * plus the per-source behavior the worker needs (ADR-0009, ADR-0025).
 */
export const DataSourceResolutionSchema = z.object({
  sourceId: z.string(),
  workspaceId: z.string().uuid(),
  connectorType: ConnectorTypeSchema,
  behaviorProfile: BehaviorProfileSchema,
  displayName: z.string(),
});
export type DataSourceResolution = z.infer<typeof DataSourceResolutionSchema>;
