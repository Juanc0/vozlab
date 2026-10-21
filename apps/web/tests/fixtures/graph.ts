/**
 * The fixtures of the graph tests.
 *
 * The shapes are the DTOs of `@vozlab/shared-types` — the tests must not
 * invent a field.
 */

import type { NodeDto, ProposalDto, SubgraphEdgeDto } from '$lib/api/types';

export const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

export const NODE_A: NodeDto = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId: WORKSPACE_ID,
  typeKey: 'Problem',
  title: 'The campus shuttle leaves every hour',
  description: 'Reported by the students of the faculty.',
  attributes: { source: 'runbook', severity: 3 },
  authorHash: 'a'.repeat(64),
  status: 'ACTIVE',
  communityScore: 12,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:05:00.000Z'
};

export const NODE_B: NodeDto = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: WORKSPACE_ID,
  typeKey: 'Idea',
  title: 'Publish the shuttle timetable',
  description: null,
  attributes: {},
  authorHash: 'b'.repeat(64),
  status: 'PENDING',
  communityScore: 2,
  createdAt: '2026-10-19T11:00:00.000Z',
  updatedAt: '2026-10-19T11:00:00.000Z'
};

export const EDGE: SubgraphEdgeDto = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  sourceNodeId: NODE_A.id,
  targetNodeId: NODE_B.id,
  relationKey: 'SUGGESTS',
  status: 'ACTIVE',
  communityScore: 3
};

/** A third node of the window — it has one relation of its own. */
export const NODE_C: NodeDto = {
  id: '99999999-9999-4999-8999-999999999999',
  workspaceId: WORKSPACE_ID,
  typeKey: 'Task',
  title: 'Publish the timetable in the halls',
  description: 'The faculties agreed to print it.',
  attributes: { owner: 'library' },
  authorHash: 'e'.repeat(64),
  status: 'ACTIVE',
  communityScore: 5,
  createdAt: '2026-10-19T09:00:00.000Z',
  updatedAt: '2026-10-19T09:30:00.000Z'
};

/** A second relation: it gives `NODE_B` more relations than the others. */
export const EDGE_B: SubgraphEdgeDto = {
  id: 'abababab-abab-4bab-8bab-abababababab',
  sourceNodeId: NODE_B.id,
  targetNodeId: NODE_C.id,
  relationKey: 'INFORMS',
  status: 'ACTIVE',
  communityScore: 5
};

/** A relation between the first node and the third one. */
export const EDGE_C: SubgraphEdgeDto = {
  id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
  sourceNodeId: NODE_A.id,
  targetNodeId: NODE_C.id,
  relationKey: 'SOLVES',
  status: 'PENDING',
  communityScore: 1
};

export const PROPOSAL: ProposalDto = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  workspaceId: WORKSPACE_ID,
  targetId: NODE_A.id,
  targetType: 'NODE',
  kind: 'EDIT',
  status: 'PENDING',
  communityScore: 3,
  justification: 'The title names the wrong building.',
  proposerHash: 'c'.repeat(64),
  resolvedBy: null,
  resolvedAt: null,
  proposedChanges: { title: 'The campus shuttle leaves every 30 minutes' },
  createdAt: '2026-10-19T12:00:00.000Z'
};

/** A proposal that targets another node. */
export const OTHER_PROPOSAL: ProposalDto = {
  ...PROPOSAL,
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  targetId: NODE_B.id
};

/** A node that was just created by the user. */
export const NEW_NODE: NodeDto = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  workspaceId: WORKSPACE_ID,
  typeKey: 'Problem',
  title: 'The lab closes at six',
  description: null,
  attributes: { severity: 2 },
  authorHash: 'd'.repeat(64),
  status: 'PENDING',
  communityScore: 0,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z'
};
