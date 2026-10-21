/**
 * The fixtures of the inspector tests.
 *
 * The shapes are the DTOs of `@vozlab/shared-types` — the tests must not
 * invent a field.
 */

import type { EdgeDto, PostDto, ThreadDto } from '$lib/api/types';
import { EDGE, NODE_A, NODE_B, WORKSPACE_ID } from './graph';

/**
 * The relation, read whole.
 *
 * The subgraph carries the **topology** of a relation only: the attributes,
 * the author pseudonym and the timestamps are in the relation itself, and
 * the inspector reads it with `GET /api/v1/edges/:id`.
 */
export const EDGE_DTO: EdgeDto = {
  id: EDGE.id,
  workspaceId: WORKSPACE_ID,
  sourceNodeId: NODE_A.id,
  targetNodeId: NODE_B.id,
  relationKey: EDGE.relationKey,
  attributes: { weight: 3 },
  authorHash: 'a'.repeat(64),
  status: 'ACTIVE',
  communityScore: 3,
  createdAt: '2026-10-19T10:10:00.000Z'
};

/** A thread about the first node. */
export const THREAD: ThreadDto = {
  id: '12121212-1212-4121-8121-121212121212',
  workspaceId: WORKSPACE_ID,
  targetId: NODE_A.id,
  targetType: 'NODE',
  title: 'Is the shuttle every hour or every thirty minutes?',
  status: 'OPEN',
  createdByHash: 'b'.repeat(64),
  createdAt: '2026-10-19T13:00:00.000Z',
  updatedAt: '2026-10-19T13:00:00.000Z'
};

/** The first post of the thread. */
export const POST: PostDto = {
  id: '13131313-1313-4131-8131-131313131313',
  threadId: THREAD.id,
  parentPostId: null,
  authorHash: 'b'.repeat(64),
  body: 'The timetable of the faculties says every hour.',
  upvotes: 2,
  downvotes: 0,
  communityScore: 2,
  createdAt: '2026-10-19T13:05:00.000Z'
};

/** A reply to the first post. */
export const REPLY: PostDto = {
  id: '14141414-1414-4141-8141-141414141414',
  threadId: THREAD.id,
  parentPostId: POST.id,
  authorHash: 'c'.repeat(64),
  body: 'The stop in front of the library has its own timetable.',
  upvotes: 1,
  downvotes: 0,
  communityScore: 1,
  createdAt: '2026-10-19T13:10:00.000Z'
};
