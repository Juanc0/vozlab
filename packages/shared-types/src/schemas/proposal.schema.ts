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
 * Zod schema for the proposal list query string (NFR-04).
 * `status`/`targetType` narrow the workspace's proposals; `limit` is clamped
 * to 1..100 (default 20); `cursor` is the opaque keyset token returned as
 * `nextCursor` by a previous page.
 */
export const ListProposalQuerySchema = z.object({
  status: ProposalStatusSchema.optional(),
  targetType: TargetTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type ListProposalQueryInput = z.infer<typeof ListProposalQuerySchema>;

/**
 * Zod schema for creating an edit proposal (Pull Request style).
 */
export const CreateProposalSchema = z.object({
  targetId: z.string().uuid('targetId must be a valid UUID'),
  targetType: TargetTypeSchema,
  proposedChanges: z.record(z.unknown()),
  justification: z.string().optional(),
});

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

/**
 * Zod schema for approving or rejecting a proposal.
 */
export const ResolveProposalSchema = z.object({
  proposalId: z.string().uuid('proposalId must be a valid UUID'),
  action: z.enum(['APPROVE', 'REJECT']),
});

export type ResolveProposalInput = z.infer<typeof ResolveProposalSchema>;