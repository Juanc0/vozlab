import { z } from 'zod';

/**
 * Valid proposal status values for the state machine.
 * PENDING -> APPROVED_BY_AUTHOR | REJECTED_BY_AUTHOR | AUTO_APPLIED
 */
export const ProposalStatusSchema = z.enum([
  'PENDING',
  'APPROVED_BY_AUTHOR',
  'REJECTED_BY_AUTHOR',
  'AUTO_APPLIED',
]);

export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

/**
 * Valid target types for edit proposals.
 */
export const TargetTypeSchema = z.enum(['NODE', 'EDGE', 'ONTOLOGY']);

export type TargetType = z.infer<typeof TargetTypeSchema>;

/**
 * The kind of a proposal (ADR-0026).
 *
 * `EDIT` is an attribute delta applied to the target; `MERGE` folds a node
 * into another one. The kind is stored with the proposal, so it is never
 * inferred from the shape of the payload.
 */
export const ProposalKindSchema = z.enum(['EDIT', 'MERGE']);

export type ProposalKind = z.infer<typeof ProposalKindSchema>;

/**
 * The payload of a `MERGE` proposal: the node that survives. The proposal's
 * target is the node that is merged away (ADR-0026).
 */
export const MergeProposalChangesSchema = z.object({
  mergeIntoNodeId: z.string().uuid('mergeIntoNodeId must be a valid UUID'),
});

export type MergeProposalChanges = z.infer<typeof MergeProposalChangesSchema>;

/**
 * Zod schema for the proposal list query string (NFR-04).
 * `status`/`targetType`/`kind` narrow the workspace's proposals; `limit` is
 * clamped to 1..100 (default 20); `cursor` is the opaque keyset token
 * returned as `nextCursor` by a previous page.
 */
export const ListProposalQuerySchema = z.object({
  status: ProposalStatusSchema.optional(),
  targetType: TargetTypeSchema.optional(),
  kind: ProposalKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type ListProposalQueryInput = z.infer<typeof ListProposalQuerySchema>;

/**
 * An `EDIT` proposal: a delta applied to the target.
 */
const editProposalSchema = z.object({
  kind: z.literal('EDIT').default('EDIT'),
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: TargetTypeSchema,
  proposedChanges: z.record(z.unknown()),
  justification: z.string().optional(),
});

/**
 * A `MERGE` proposal: the target node is merged into `mergeIntoNodeId`
 * (ADR-0026). Only a node can be merged away.
 */
const mergeProposalSchema = z.object({
  kind: z.literal('MERGE'),
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: z.literal('NODE'),
  proposedChanges: MergeProposalChangesSchema,
  justification: z.string().optional(),
});

/**
 * Zod schema for creating a proposal (Pull Request style).
 *
 * A discriminated union on `kind` (ADR-0026): `EDIT` keeps the historical
 * shape, `MERGE` names the surviving node. A request without `kind` is an
 * `EDIT` proposal, so the contract stays backwards compatible.
 */
export const CreateProposalSchema = z.preprocess(
  (value) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { kind?: unknown }).kind === undefined
    ) {
      return { ...(value as Record<string, unknown>), kind: 'EDIT' };
    }
    return value;
  },
  z.discriminatedUnion('kind', [editProposalSchema, mergeProposalSchema])
);

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

/**
 * Zod schema for approving or rejecting a proposal.
 */
export const ResolveProposalSchema = z.object({
  proposalId: z.string().uuid('proposalId must be a valid UUID'),
  action: z.enum(['APPROVE', 'REJECT']),
});

export type ResolveProposalInput = z.infer<typeof ResolveProposalSchema>;

/**
 * Stable JSON projection of an EditProposal — the element returned by
 * `GET /api/v1/proposals` and `GET /api/v1/proposals/:id`.
 *
 * It never leaks the raw entity internals (e.g. the `AuthorHash` value
 * object): the pseudonyms are emitted as their 64-hex strings (NFR-07) and
 * `proposedChanges` is passed through as-is. The API owns the projection
 * (`ProposalController`); the PWA consumes the result read-only.
 */
export interface ProposalDto {
  id: string;
  workspaceId: string;
  targetId: string;
  targetType: TargetType;
  /** ADR-0026: `EDIT` (an attribute delta) or `MERGE` (a node is folded in). */
  kind: ProposalKind;
  status: ProposalStatus;
  communityScore: number;
  justification: string | null;
  proposerHash: string;
  resolvedBy: string | null;
  /** ISO-8601 instant, or `null` while the proposal is still open. */
  resolvedAt: string | null;
  proposedChanges: Record<string, unknown>;
  /** ISO-8601 instant. */
  createdAt: string;
}
