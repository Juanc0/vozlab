import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../src/shared/config/env.js';
import { registerRoutes, type RouteDependencies } from '../../src/infrastructure/http/routes.js';
import type { RateLimitingMiddleware } from '../../src/infrastructure/http/middlewares/RateLimitingMiddleware.js';
import type { RedisTokenBlacklist } from '../../src/infrastructure/events/RedisTokenBlacklist.js';

import { AddWorkspaceMemberUseCase } from '../../src/application/use_cases/AddWorkspaceMemberUseCase.js';
import { ApproveJoinRequestUseCase } from '../../src/application/use_cases/ApproveJoinRequestUseCase.js';
import { ManageRoleAtomicUseCase } from '../../src/application/use_cases/ManageRoleAtomicUseCase.js';
import { ChangeMemberRoleUseCase } from '../../src/application/use_cases/ChangeMemberRoleUseCase.js';
import { CleanupExpiredInvitationsUseCase } from '../../src/application/use_cases/CleanupExpiredInvitationsUseCase.js';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import { CreateGlobalInvitationUseCase } from '../../src/application/use_cases/CreateGlobalInvitationUseCase.js';
import { CreateInvitationUseCase } from '../../src/application/use_cases/CreateInvitationUseCase.js';
import { CreateWorkspaceJoinCodeUseCase } from '../../src/application/use_cases/CreateWorkspaceJoinCodeUseCase.js';
import { UpdateWorkspaceJoinCodeUseCase } from '../../src/application/use_cases/UpdateWorkspaceJoinCodeUseCase.js';
import { CreateWorkspaceUseCase } from '../../src/application/use_cases/CreateWorkspaceUseCase.js';
import { DiscoverWorkspacesUseCase } from '../../src/application/use_cases/DiscoverWorkspacesUseCase.js';
import { GetMeUseCase } from '../../src/application/use_cases/GetMeUseCase.js';
import { GetWorkspaceUseCase } from '../../src/application/use_cases/GetWorkspaceUseCase.js';
import { JoinEventUseCase } from '../../src/application/use_cases/JoinEventUseCase.js';
import { ListInvitationsUseCase } from '../../src/application/use_cases/ListInvitationsUseCase.js';
import { ListJoinRequestsUseCase } from '../../src/application/use_cases/ListJoinRequestsUseCase.js';
import { ListMembersUseCase } from '../../src/application/use_cases/ListMembersUseCase.js';
import { ListMyJoinRequestsUseCase } from '../../src/application/use_cases/ListMyJoinRequestsUseCase.js';
import { ListTenantUsersUseCase } from '../../src/application/use_cases/ListTenantUsersUseCase.js';
import { ListWorkspacesUseCase } from '../../src/application/use_cases/ListWorkspacesUseCase.js';
import { LogoutUseCase } from '../../src/application/use_cases/LogoutUseCase.js';
import { ReactivateMemberUseCase } from '../../src/application/use_cases/ReactivateMemberUseCase.js';
import { RefreshSessionUseCase } from '../../src/application/use_cases/RefreshSessionUseCase.js';
import { RejectJoinRequestUseCase } from '../../src/application/use_cases/RejectJoinRequestUseCase.js';
import { RejectProposalUseCase } from '../../src/application/use_cases/RejectProposalUseCase.js';
import { RemoveMemberUseCase } from '../../src/application/use_cases/RemoveMemberUseCase.js';
import { RequestWorkspaceAccessUseCase } from '../../src/application/use_cases/RequestWorkspaceAccessUseCase.js';
import { ResolveSourceUseCase } from '../../src/application/use_cases/ResolveSourceUseCase.js';
import { RevokeInvitationUseCase } from '../../src/application/use_cases/RevokeInvitationUseCase.js';
import { RotateJoinCodeUseCase } from '../../src/application/use_cases/RotateJoinCodeUseCase.js';
import { StartOidcLoginUseCase } from '../../src/application/use_cases/StartOidcLoginUseCase.js';
import { SuspendMemberUseCase } from '../../src/application/use_cases/SuspendMemberUseCase.js';
import { UpdateWorkspaceUseCase } from '../../src/application/use_cases/UpdateWorkspaceUseCase.js';
import { UpdateEdgeUseCase } from '../../src/application/use_cases/UpdateEdgeUseCase.js';
// Graph routes are never hit here, but RouteDependencies requires them.
import { ActivateOntologyClassUseCase } from '../../src/application/use_cases/ActivateOntologyClassUseCase.js';
import { AddPostUseCase } from '../../src/application/use_cases/AddPostUseCase.js';
import { ApproveProposalUseCase } from '../../src/application/use_cases/ApproveProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../src/application/use_cases/AutoApplyProposalUseCase.js';
import { CastVoteUseCase } from '../../src/application/use_cases/CastVoteUseCase.js';
import { CloseThreadUseCase } from '../../src/application/use_cases/CloseThreadUseCase.js';
import { CreateEdgeUseCase } from '../../src/application/use_cases/CreateEdgeUseCase.js';
import { CreateNodeUseCase } from '../../src/application/use_cases/CreateNodeUseCase.js';
import { CreateProposalUseCase } from '../../src/application/use_cases/CreateProposalUseCase.js';
import { CreateThreadUseCase } from '../../src/application/use_cases/CreateThreadUseCase.js';
import { DeleteEdgeUseCase } from '../../src/application/use_cases/DeleteEdgeUseCase.js';
import { DeleteNodeUseCase } from '../../src/application/use_cases/DeleteNodeUseCase.js';
import { DeletePostUseCase } from '../../src/application/use_cases/DeletePostUseCase.js';
import { GetEdgeUseCase } from '../../src/application/use_cases/GetEdgeUseCase.js';
import { GetNodeUseCase } from '../../src/application/use_cases/GetNodeUseCase.js';
import { GetNodeNeighborsUseCase } from '../../src/application/use_cases/GetNodeNeighborsUseCase.js';
import { GetNodeWindowUseCase } from '../../src/application/use_cases/GetNodeWindowUseCase.js';
import { GetOntologyUseCase } from '../../src/application/use_cases/GetOntologyUseCase.js';
import { GetProposalUseCase } from '../../src/application/use_cases/GetProposalUseCase.js';
import { GetSubgraphUseCase } from '../../src/application/use_cases/GetSubgraphUseCase.js';
import { ListEdgesUseCase } from '../../src/application/use_cases/ListEdgesUseCase.js';
import { ListNodesUseCase } from '../../src/application/use_cases/ListNodesUseCase.js';
import { ListPostsUseCase } from '../../src/application/use_cases/ListPostsUseCase.js';
import { ListProposalsUseCase } from '../../src/application/use_cases/ListProposalsUseCase.js';
import { ListThreadsUseCase } from '../../src/application/use_cases/ListThreadsUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../src/application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../src/application/use_cases/ProposeObjectPropertyUseCase.js';
import { ProposeOntologyClassUseCase } from '../../src/application/use_cases/ProposeOntologyClassUseCase.js';
import { SetNodeEmbeddingUseCase } from '../../src/application/use_cases/SetNodeEmbeddingUseCase.js';

import {
  AUTH_USER,
  AUTHOR_HASH,
  TENANT_KEY,
  USER_ID,
  WORKSPACE_ID,
  makeMembershipRepository,
  makeRouterDb,
  makeTokenBlacklist,
  makeUserRepository,
} from '../support/authFakes.js';
import { makeDisplayNameCatalog, makeOntologyRepository } from '../support/fakes.js';

function unused<T extends object>(prototype: T): T {
  return Object.create(prototype) as T;
}

/** A tenant-ADMIN token: the guards read the role from the (fake) user repo. */
function signToken(): string {
  return jwt.sign(
    { sub: USER_ID, tid: TENANT_KEY, jti: 'jti-1', authorHash: AUTHOR_HASH },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

const ADMIN_USER = { systemRole: 'ADMIN' };

interface Hit {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  withWorkspaceHeader?: boolean;
}

/**
 * P0-5 (v6/TASK-07): every administration WRITE route must carry a
 * per-action `scopedRateLimitMiddleware`, keyed by the internal tenant and
 * the actor. The limiter spy reports the buckets it was asked about, so a
 * route without its dedicated scope never trips the limit.
 */
async function hit(limitedBuckets: Set<string>, route: Hit) {
  const asked: Array<{ bucket: string; actor: string }> = [];
  const rateLimiter = {
    async isRateLimited(_tenantId: string, bucket: string, _method: string, actor: string) {
      asked.push({ bucket, actor });
      return limitedBuckets.has(bucket);
    },
  } as unknown as RateLimitingMiddleware;

  const { routerDb } = makeRouterDb();
  const { membershipRepo } = makeMembershipRepository();
  const { userRepo } = makeUserRepository({
    user: { ...AUTH_USER, systemRole: 'ADMIN' },
  });
  const { blacklist } = makeTokenBlacklist();

  const deps: RouteDependencies = {
    createNodeUseCase: unused(CreateNodeUseCase.prototype),
    getNodeUseCase: unused(GetNodeUseCase.prototype),
    getNodeNeighborsUseCase: unused(GetNodeNeighborsUseCase.prototype),
    resolveSourceUseCase: unused(ResolveSourceUseCase.prototype),
    listNodesUseCase: unused(ListNodesUseCase.prototype),
    deleteNodeUseCase: unused(DeleteNodeUseCase.prototype),
    setNodeEmbeddingUseCase: unused(SetNodeEmbeddingUseCase.prototype),
    getSubgraphUseCase: unused(GetSubgraphUseCase.prototype),
    getNodeWindowUseCase: unused(GetNodeWindowUseCase.prototype),
    createProposalUseCase: unused(CreateProposalUseCase.prototype),
    approveProposalUseCase: unused(ApproveProposalUseCase.prototype),
    rejectProposalUseCase: unused(RejectProposalUseCase.prototype),
    autoApplyProposalUseCase: unused(AutoApplyProposalUseCase.prototype),
    listProposalsUseCase: unused(ListProposalsUseCase.prototype),
    getProposalUseCase: unused(GetProposalUseCase.prototype),
    createEdgeUseCase: unused(CreateEdgeUseCase.prototype),
    getEdgeUseCase: unused(GetEdgeUseCase.prototype),
    listEdgesUseCase: unused(ListEdgesUseCase.prototype),
    updateEdgeUseCase: unused(UpdateEdgeUseCase.prototype),
    deleteEdgeUseCase: unused(DeleteEdgeUseCase.prototype),
    proposeOntologyClassUseCase: unused(ProposeOntologyClassUseCase.prototype),
    proposeDatatypePropertyUseCase: unused(ProposeDatatypePropertyUseCase.prototype),
    proposeObjectPropertyUseCase: unused(ProposeObjectPropertyUseCase.prototype),
    activateOntologyClassUseCase: unused(ActivateOntologyClassUseCase.prototype),
    getOntologyUseCase: unused(GetOntologyUseCase.prototype),
    createThreadUseCase: unused(CreateThreadUseCase.prototype),
    addPostUseCase: unused(AddPostUseCase.prototype),
    listThreadsUseCase: unused(ListThreadsUseCase.prototype),
    listPostsUseCase: unused(ListPostsUseCase.prototype),
    closeThreadUseCase: unused(CloseThreadUseCase.prototype),
    deletePostUseCase: unused(DeletePostUseCase.prototype),
    castVoteUseCase: unused(CastVoteUseCase.prototype),
    startOidcLoginUseCase: unused(StartOidcLoginUseCase.prototype),
    completeOidcLoginUseCase: unused(CompleteOidcLoginUseCase.prototype),
    refreshSessionUseCase: unused(RefreshSessionUseCase.prototype),
    logoutUseCase: unused(LogoutUseCase.prototype),
    getMeUseCase: unused(GetMeUseCase.prototype),
    joinEventUseCase: unused(JoinEventUseCase.prototype),
    cleanupUseCase: unused(CleanupExpiredInvitationsUseCase.prototype),
    createWorkspaceJoinCodeUseCase: unused(CreateWorkspaceJoinCodeUseCase.prototype),
    updateWorkspaceJoinCodeUseCase: unused(UpdateWorkspaceJoinCodeUseCase.prototype),
    createGlobalInvitationUseCase: unused(CreateGlobalInvitationUseCase.prototype),
    createWorkspaceUseCase: unused(CreateWorkspaceUseCase.prototype),
    getWorkspaceUseCase: unused(GetWorkspaceUseCase.prototype),
    updateWorkspaceUseCase: unused(UpdateWorkspaceUseCase.prototype),
    rotateJoinCodeUseCase: unused(RotateJoinCodeUseCase.prototype),
    listWorkspacesUseCase: unused(ListWorkspacesUseCase.prototype),
    listTenantUsersUseCase: unused(ListTenantUsersUseCase.prototype),
    listMembersUseCase: unused(ListMembersUseCase.prototype),
    addWorkspaceMemberUseCase: unused(AddWorkspaceMemberUseCase.prototype),
    changeMemberRoleUseCase: unused(ChangeMemberRoleUseCase.prototype),
    manageRoleUseCase: unused(ManageRoleAtomicUseCase.prototype),
    suspendMemberUseCase: unused(SuspendMemberUseCase.prototype),
    reactivateMemberUseCase: unused(ReactivateMemberUseCase.prototype),
    removeMemberUseCase: unused(RemoveMemberUseCase.prototype),
    listJoinRequestsUseCase: unused(ListJoinRequestsUseCase.prototype),
    approveJoinRequestUseCase: unused(ApproveJoinRequestUseCase.prototype),
    rejectJoinRequestUseCase: unused(RejectJoinRequestUseCase.prototype),
    requestWorkspaceAccessUseCase: unused(RequestWorkspaceAccessUseCase.prototype),
    discoverWorkspacesUseCase: unused(DiscoverWorkspacesUseCase.prototype),
    listMyJoinRequestsUseCase: unused(ListMyJoinRequestsUseCase.prototype),
    createInvitationUseCase: unused(CreateInvitationUseCase.prototype),
    listInvitationsUseCase: unused(ListInvitationsUseCase.prototype),
    revokeInvitationUseCase: unused(RevokeInvitationUseCase.prototype),
    routerDb,
    membershipRepo,
    userRepo,
    tokenBlacklist: blacklist as unknown as RedisTokenBlacklist,
    rateLimiter,
  };

  const app: FastifyInstance = Fastify();
  await registerRoutes(app, deps);
  const response = await app.inject({
    method: route.method,
    url: route.url,
    headers: {
      authorization: `Bearer ${signToken()}`,
      ...(route.withWorkspaceHeader === false ? {} : { 'x-workspace-id': WORKSPACE_ID }),
    },
  });
  await app.close();
  return { response, asked };
}

const WS = WORKSPACE_ID;

describe('admin routes carry dedicated per-actor rate limits (P0-5)', () => {
  const cases: Array<{ title: string; scope: string; route: Hit }> = [
    { title: 'create workspace', scope: 'admin-create-workspace', route: { method: 'POST', url: '/api/v1/admin/workspaces', withWorkspaceHeader: false } },
    { title: 'global invitation', scope: 'admin-global-invitation', route: { method: 'POST', url: '/api/v1/invitations/global', withWorkspaceHeader: false } },
    { title: 'cleanup', scope: 'admin-cleanup', route: { method: 'POST', url: '/api/v1/admin/cleanup', withWorkspaceHeader: false } },
    { title: 'switch tenant', scope: 'auth-switch-tenant', route: { method: 'POST', url: '/api/v1/auth/switch-tenant', withWorkspaceHeader: false } },
    { title: 'join code create', scope: 'admin-join-code', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/join-codes` } },
    { title: 'join code update', scope: 'admin-join-code', route: { method: 'PATCH', url: `/api/v1/workspaces/${WS}/join-codes/c-1` } },
    { title: 'join code revoke', scope: 'admin-join-code', route: { method: 'DELETE', url: `/api/v1/workspaces/${WS}/join-codes/c-1` } },
    { title: 'join code rotate', scope: 'admin-join-code', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/join-code/rotate` } },
    { title: 'workspace patch', scope: 'admin-workspace', route: { method: 'PATCH', url: `/api/v1/workspaces/${WS}` } },
    { title: 'member add', scope: 'admin-member', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/members` } },
    { title: 'member role change', scope: 'admin-member', route: { method: 'PATCH', url: `/api/v1/workspaces/${WS}/members/${USER_ID}` } },
    { title: 'member role assign', scope: 'admin-member', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/members/${USER_ID}/roles` } },
    { title: 'member role remove', scope: 'admin-member', route: { method: 'DELETE', url: `/api/v1/workspaces/${WS}/members/${USER_ID}/roles/MEMBER` } },
    { title: 'member suspend', scope: 'admin-member', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/members/${USER_ID}/suspend` } },
    { title: 'member reactivate', scope: 'admin-member', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/members/${USER_ID}/reactivate` } },
    { title: 'member remove', scope: 'admin-member', route: { method: 'DELETE', url: `/api/v1/workspaces/${WS}/members/${USER_ID}` } },
    { title: 'join request approve', scope: 'admin-join-request', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/join-requests/r-1/approve` } },
    { title: 'join request reject', scope: 'admin-join-request', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/join-requests/r-1/reject` } },
    { title: 'invitation create', scope: 'admin-invitation', route: { method: 'POST', url: `/api/v1/workspaces/${WS}/invitations` } },
    { title: 'invitation revoke', scope: 'admin-invitation', route: { method: 'DELETE', url: '/api/v1/invitations/i-1' } },
    { title: 'join request create (onboarding)', scope: 'join-request-create', route: { method: 'POST', url: '/api/v1/workspace-join-requests', withWorkspaceHeader: false } },
  ];

  for (const { title, scope, route } of cases) {
    it(`${title}: limited on ${scope} → 429`, async () => {
      const { response, asked } = await hit(new Set([scope]), route);
      expect(asked.map((a) => a.bucket)).toContain(scope);
      // The bucket is keyed by the pseudonymous actor, not the raw user id.
      expect(asked.find((a) => a.bucket === scope)?.actor).toBe(AUTHOR_HASH);
      expect(response.statusCode).toBe(429);
      expect(response.json().code).toBe('ERR_RATE_LIMIT_EXCEEDED');
    });

    it(`${title}: NOT limited when its own bucket is free`, async () => {
      const { response, asked } = await hit(new Set(['some-other-scope']), route);
      expect(asked.map((a) => a.bucket)).toContain(scope);
      // The scoped middleware passes; whatever the stub use case answers is
      // irrelevant — the point is that it is not a rate-limit rejection.
      expect(response.statusCode).not.toBe(429);
    });
  }

  it('a read route (join-codes list) has no scoped bucket', async () => {
    const { response, asked } = await hit(
      new Set(['admin-join-code']),
      { method: 'GET', url: `/api/v1/workspaces/${WS}/join-codes` }
    );
    expect(asked.map((a) => a.bucket)).not.toContain('admin-join-code');
    expect(response.statusCode).not.toBe(429);
  });
});
