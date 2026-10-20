/**
 * The fixtures of the governance tests.
 *
 * The shapes are the DTOs of `@vozlab/shared-types` — the tests must not
 * invent a field.
 */

import type { PostDto, ProposalDto, ThreadDto } from '$lib/api/types';
import { NODE_A, NODE_B, WORKSPACE_ID } from './graph';

/** The pseudonym of the maintainer of `NODE_A` (its author). */
export const MAINTAINER_HASH = NODE_A.authorHash;

/** The pseudonym of the author of the proposals — not the maintainer. */
export const PROPOSER_HASH = 'c'.repeat(64);

/** The pseudonym of a user with no relation to the workspace content. */
export const OTHER_HASH = 'f'.repeat(64);

/** A pending edit proposal on `NODE_A`. */
export const PROPOSAL: ProposalDto = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  workspaceId: WORKSPACE_ID,
  targetId: NODE_A.id,
  targetType: 'NODE',
  kind: 'EDIT',
  status: 'PENDING',
  communityScore: 3,
  justification: 'The title names the wrong building.',
  proposerHash: PROPOSER_HASH,
  resolvedBy: null,
  resolvedAt: null,
  proposedChanges: { title: 'The campus shuttle leaves every 30 minutes' },
  createdAt: '2026-10-19T12:00:00.000Z'
};

/** A merge proposal: `NODE_B` is merged away into `NODE_A` (ADR-0026). */
export const MERGE_PROPOSAL: ProposalDto = {
  ...PROPOSAL,
  id: '12121212-1212-4121-8121-121212121212',
  kind: 'MERGE',
  targetId: NODE_B.id,
  proposedChanges: { mergeIntoNodeId: NODE_A.id }
};

/**
 * A merge proposal whose payload does not name a surviving node.
 *
 * The payload is JSONB: the type of the DTO promises nothing about its
 * content, so a malformed one must not break the view.
 */
export const BROKEN_MERGE_PROPOSAL: ProposalDto = {
  ...MERGE_PROPOSAL,
  id: '13131313-1313-4131-8131-131313131313',
  proposedChanges: { mergeIntoNodeId: 'not-a-uuid' }
};

/** A proposal old enough and popular enough for the auto-apply criteria. */
export const OLD_SUPPORTED_PROPOSAL: ProposalDto = {
  ...PROPOSAL,
  id: '14141414-1414-4141-8141-141414141414',
  communityScore: 12,
  createdAt: '2025-09-01T12:00:00.000Z'
};

/** An open thread about `NODE_A`, created by the maintainer. */
export const THREAD: ThreadDto = {
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: WORKSPACE_ID,
  targetId: NODE_A.id,
  targetType: 'NODE',
  title: 'Should the shuttle run every 30 minutes?',
  status: 'OPEN',
  createdByHash: MAINTAINER_HASH,
  createdAt: '2026-10-19T13:00:00.000Z',
  updatedAt: '2026-10-19T13:00:00.000Z'
};

/** A thread created by somebody else. */
export const OTHER_THREAD: ThreadDto = {
  ...THREAD,
  id: '23232323-2323-4323-8323-232323232323',
  createdByHash: OTHER_HASH
};

/** A comment written by another user. */
export const POST: PostDto = {
  id: '33333333-3333-4333-8333-333333333333',
  threadId: THREAD.id,
  parentPostId: null,
  authorHash: OTHER_HASH,
  body: 'A service every 30 minutes would double the operating cost.',
  upvotes: 1,
  downvotes: 0,
  communityScore: 1,
  createdAt: '2026-10-19T14:00:00.000Z'
};

/** The reply of the maintainer under {@link POST}. */
export const REPLY: PostDto = {
  id: '44444444-4444-4444-8444-444444444444',
  threadId: THREAD.id,
  parentPostId: POST.id,
  authorHash: MAINTAINER_HASH,
  body: 'The budget of the next term covers it.',
  upvotes: 0,
  downvotes: 0,
  communityScore: 0,
  createdAt: '2026-10-19T15:00:00.000Z'
};
