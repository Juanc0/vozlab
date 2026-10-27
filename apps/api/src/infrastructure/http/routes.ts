import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../application/use_cases/GetNodeUseCase.js';
import { GetNodeNeighborsUseCase } from '../../application/use_cases/GetNodeNeighborsUseCase.js';
import { GetNodeWindowUseCase } from '../../application/use_cases/GetNodeWindowUseCase.js';
import { ResolveSourceUseCase } from '../../application/use_cases/ResolveSourceUseCase.js';
import { GetSubgraphUseCase } from '../../application/use_cases/GetSubgraphUseCase.js';
import { ListNodesUseCase } from '../../application/use_cases/ListNodesUseCase.js';
import { DeleteNodeUseCase } from '../../application/use_cases/DeleteNodeUseCase.js';
import { SetNodeEmbeddingUseCase } from '../../application/use_cases/SetNodeEmbeddingUseCase.js';
import { CreateProposalUseCase } from '../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../application/use_cases/AutoApplyProposalUseCase.js';
import { ListProposalsUseCase } from '../../application/use_cases/ListProposalsUseCase.js';
import { GetProposalUseCase } from '../../application/use_cases/GetProposalUseCase.js';
import { CreateEdgeUseCase } from '../../application/use_cases/CreateEdgeUseCase.js';
import { GetEdgeUseCase } from '../../application/use_cases/GetEdgeUseCase.js';
import { ListEdgesUseCase } from '../../application/use_cases/ListEdgesUseCase.js';
import { UpdateEdgeUseCase } from '../../application/use_cases/UpdateEdgeUseCase.js';
import { DeleteEdgeUseCase } from '../../application/use_cases/DeleteEdgeUseCase.js';
import { ProposeOntologyClassUseCase } from '../../application/use_cases/ProposeOntologyClassUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../application/use_cases/ProposeObjectPropertyUseCase.js';
import { ActivateOntologyClassUseCase } from '../../application/use_cases/ActivateOntologyClassUseCase.js';
import { GetOntologyUseCase } from '../../application/use_cases/GetOntologyUseCase.js';
import { CreateThreadUseCase } from '../../application/use_cases/CreateThreadUseCase.js';
import { AddPostUseCase } from '../../application/use_cases/AddPostUseCase.js';
import { ListThreadsUseCase } from '../../application/use_cases/ListThreadsUseCase.js';
import { ListPostsUseCase } from '../../application/use_cases/ListPostsUseCase.js';
import { CloseThreadUseCase } from '../../application/use_cases/CloseThreadUseCase.js';
import { DeletePostUseCase } from '../../application/use_cases/DeletePostUseCase.js';
import { CastVoteUseCase } from '../../application/use_cases/CastVoteUseCase.js';
import { StartOidcLoginUseCase } from '../../application/use_cases/StartOidcLoginUseCase.js';
import { CompleteOidcLoginUseCase } from '../../application/use_cases/CompleteOidcLoginUseCase.js';
import { RefreshSessionUseCase } from '../../application/use_cases/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../application/use_cases/LogoutUseCase.js';
import { GetMeUseCase } from '../../application/use_cases/GetMeUseCase.js';
import { JoinEventUseCase } from '../../application/use_cases/JoinEventUseCase.js';
import { InviteToWorkspaceUseCase } from '../../application/use_cases/InviteToWorkspaceUseCase.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { ITenantIdentityProviderRepository } from '../../domain/ports/ITenantIdentityProviderRepository.js';
import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { authGuard } from './middlewares/AuthGuard.js';
import { requireAgentType, requireSystemAgent } from './middlewares/agentGuard.js';
import { tenantGuard } from './middlewares/TenantGuard.js';
import { tenantWorkspaceGuard } from './middlewares/TenantWorkspaceGuard.js';
import {
  RateLimitingMiddleware,
  publicAuthRateLimitMiddleware,
  rateLimitMiddleware,
  scopedRateLimitMiddleware,
} from './middlewares/RateLimitingMiddleware.js';
import { NodeController } from './controllers/NodeController.js';
import { EdgeController } from './controllers/EdgeController.js';
import { ProposalController } from './controllers/ProposalController.js';
import { OntologyController } from './controllers/OntologyController.js';
import { HealthController } from './controllers/HealthController.js';
import { DiscussionController } from './controllers/DiscussionController.js';
import { InteractionController } from './controllers/InteractionController.js';
import { AuthController } from './controllers/AuthController.js';
import { MembershipController } from './controllers/MembershipController.js';
import { TenantIdentityProviderController } from './controllers/TenantIdentityProviderController.js';
import { IngestionController } from './controllers/IngestionController.js';

/**
 * Dependencies required to register routes (manual Composition Root).
 */
export interface RouteDependencies {
  createNodeUseCase: CreateNodeUseCase;
  getNodeUseCase: GetNodeUseCase;
  getNodeNeighborsUseCase: GetNodeNeighborsUseCase;
  resolveSourceUseCase: ResolveSourceUseCase;
  listNodesUseCase: ListNodesUseCase;
  deleteNodeUseCase: DeleteNodeUseCase;
  setNodeEmbeddingUseCase: SetNodeEmbeddingUseCase;
  getSubgraphUseCase: GetSubgraphUseCase;
  getNodeWindowUseCase: GetNodeWindowUseCase;
  createProposalUseCase: CreateProposalUseCase;
  approveProposalUseCase: ApproveProposalUseCase;
  rejectProposalUseCase: RejectProposalUseCase;
  autoApplyProposalUseCase: AutoApplyProposalUseCase;
  listProposalsUseCase: ListProposalsUseCase;
  getProposalUseCase: GetProposalUseCase;
  createEdgeUseCase: CreateEdgeUseCase;
  getEdgeUseCase: GetEdgeUseCase;
  listEdgesUseCase: ListEdgesUseCase;
  updateEdgeUseCase: UpdateEdgeUseCase;
  deleteEdgeUseCase: DeleteEdgeUseCase;
  proposeOntologyClassUseCase: ProposeOntologyClassUseCase;
  proposeDatatypePropertyUseCase: ProposeDatatypePropertyUseCase;
  proposeObjectPropertyUseCase: ProposeObjectPropertyUseCase;
  activateOntologyClassUseCase: ActivateOntologyClassUseCase;
  getOntologyUseCase: GetOntologyUseCase;
  createThreadUseCase: CreateThreadUseCase;
  addPostUseCase: AddPostUseCase;
  listThreadsUseCase: ListThreadsUseCase;
  listPostsUseCase: ListPostsUseCase;
  closeThreadUseCase: CloseThreadUseCase;
  deletePostUseCase: DeletePostUseCase;
  castVoteUseCase: CastVoteUseCase;
  startOidcLoginUseCase: StartOidcLoginUseCase;
  completeOidcLoginUseCase: CompleteOidcLoginUseCase;
  refreshSessionUseCase: RefreshSessionUseCase;
  logoutUseCase: LogoutUseCase;
  getMeUseCase: GetMeUseCase;
  joinEventUseCase: JoinEventUseCase;
  routerDb: IRouterDatabase;
  tenantIdentityProviderRepo?: ITenantIdentityProviderRepository;
  membershipRepo: IMembershipRepository;
  invitationRepo?: IInvitationRepository;
  inviteToWorkspaceUseCase: InviteToWorkspaceUseCase;
  tokenBlacklist: RedisTokenBlacklist;
  rateLimiter: RateLimitingMiddleware;
}

/**
 * Register all API routes with Fastify.
 *
 * Protected routes run the Zero-Trust chain in order:
 *   authGuard -> tenantWorkspaceGuard -> rateLimit -> controller
 *
 * Health endpoints are public (no auth) so that orchestrators can probe them.
 */
export async function registerRoutes(
  app: FastifyInstance,
  deps: RouteDependencies
): Promise<void> {
  const {
    createNodeUseCase,
    getNodeUseCase,
    getNodeNeighborsUseCase,
    resolveSourceUseCase,
    listNodesUseCase,
    deleteNodeUseCase,
    setNodeEmbeddingUseCase,
    getSubgraphUseCase,
    getNodeWindowUseCase,
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase,
    listProposalsUseCase,
    getProposalUseCase,
    createEdgeUseCase,
    getEdgeUseCase,
    listEdgesUseCase,
    updateEdgeUseCase,
    deleteEdgeUseCase,
    proposeOntologyClassUseCase,
    proposeDatatypePropertyUseCase,
    proposeObjectPropertyUseCase,
    activateOntologyClassUseCase,
    getOntologyUseCase,
    createThreadUseCase,
    addPostUseCase,
    listThreadsUseCase,
    listPostsUseCase,
    closeThreadUseCase,
    deletePostUseCase,
    castVoteUseCase,
    startOidcLoginUseCase,
    completeOidcLoginUseCase,
    refreshSessionUseCase,
    logoutUseCase,
    getMeUseCase,
    joinEventUseCase,
    routerDb,
    membershipRepo,
    tokenBlacklist,
    rateLimiter,
  } = deps;

  const nodeController = new NodeController(
    createNodeUseCase,
    getNodeUseCase,
    getNodeNeighborsUseCase,
    listNodesUseCase,
    getSubgraphUseCase,
    getNodeWindowUseCase,
    deleteNodeUseCase,
    setNodeEmbeddingUseCase
  );
  const edgeController = new EdgeController(
    createEdgeUseCase,
    getEdgeUseCase,
    listEdgesUseCase,
    updateEdgeUseCase,
    deleteEdgeUseCase
  );
  const proposalController = new ProposalController(
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase,
    listProposalsUseCase,
    getProposalUseCase
  );
  const ontologyController = new OntologyController(
    proposeOntologyClassUseCase,
    proposeDatatypePropertyUseCase,
    proposeObjectPropertyUseCase,
    activateOntologyClassUseCase,
    getOntologyUseCase
  );
  const healthController = new HealthController(routerDb, tokenBlacklist);
  const discussionController = new DiscussionController(
    createThreadUseCase,
    addPostUseCase,
    listThreadsUseCase,
    listPostsUseCase,
    closeThreadUseCase,
    deletePostUseCase
  );
  const interactionController = new InteractionController(castVoteUseCase);
  const authController = new AuthController(
    startOidcLoginUseCase,
    completeOidcLoginUseCase,
    refreshSessionUseCase,
    logoutUseCase,
    getMeUseCase,
    joinEventUseCase
  );
  const ingestionController = new IngestionController(resolveSourceUseCase);
  const membershipController = new MembershipController(
    deps.inviteToWorkspaceUseCase,
    deps.membershipRepo,
    deps.invitationRepo ?? (deps.membershipRepo as any)
  );

  const tipController = deps.tenantIdentityProviderRepo
    ? new TenantIdentityProviderController(deps.tenantIdentityProviderRepo)
    : null;

  // --- Public: Health probes ---
  app.get('/health', (req, reply) => healthController.live(req, reply));
  app.get('/health/live', (req, reply) => healthController.live(req, reply));
  app.get('/health/ready', (req, reply) => healthController.ready(req, reply));

  // --- Public: Authentication (FR-01/FR-02/FR-03) ---
  const publicAuthLimit = publicAuthRateLimitMiddleware(rateLimiter);

  app.get(
    '/api/v1/auth/login',
    { preHandler: [publicAuthLimit] },
    (req, reply) => authController.login(req, reply)
  );

  app.get(
    '/api/v1/auth/callback',
    { preHandler: [publicAuthLimit] },
    (req, reply) => authController.callback(req, reply)
  );

  app.post(
    '/api/v1/auth/refresh',
    { preHandler: [publicAuthLimit] },
    (req, reply) => authController.refresh(req, reply)
  );

  app.post(
    '/api/v1/auth/event-join',
    { preHandler: [publicAuthLimit] },
    (req, reply) => authController.eventJoin(req, reply)
  );

  // --- Protected chain ---
  const auth = authGuard(tokenBlacklist);
  const tenant = async (req: FastifyRequest, reply: FastifyReply) => {
    await tenantGuard(req, reply, { routerDb });
  };
  const workspace = (req: FastifyRequest, reply: FastifyReply) =>
    tenantWorkspaceGuard(req, reply, { routerDb, membershipRepo });
  const limit = rateLimitMiddleware(rateLimiter);
  const guard = [auth, workspace, limit];

  // --- Auth session (Bearer; no workspace required) ---
  app.post(
    '/api/v1/auth/logout',
    { preHandler: [auth] },
    (req, reply) => authController.logoutHandler(req, reply)
  );

  app.get(
    '/api/v1/auth/me',
    { preHandler: [auth, tenant] },
    (req, reply) => authController.me(req, reply)
  );

  // --- Membership management (D10, ADMIN only) ---
  app.post(
    '/api/v1/workspaces/:workspaceId/members/invite',
    { preHandler: guard },
    (req, reply) => membershipController.invite(req, reply)
  );

  app.patch(
    '/api/v1/workspaces/:workspaceId/members/:userId/role',
    { preHandler: guard },
    (req, reply) => membershipController.changeRole(req, reply)
  );

  app.post(
    '/api/v1/workspaces/:workspaceId/members/:userId/suspend',
    { preHandler: guard },
    (req, reply) => membershipController.suspend(req, reply)
  );

  app.post(
    '/api/v1/workspaces/:workspaceId/members/:userId/reactivate',
    { preHandler: guard },
    (req, reply) => membershipController.reactivate(req, reply)
  );

  app.delete(
    '/api/v1/workspaces/:workspaceId/members/:userId',
    { preHandler: guard },
    (req, reply) => membershipController.expel(req, reply)
  );

  app.delete(
    '/api/v1/invitations/:invitationId',
    { preHandler: guard },
    (req, reply) => membershipController.revokeInvitation(req, reply)
  );

  if (tipController) {
    app.get(
      '/api/v1/identity-providers',
      { preHandler: guard },
      (req, reply) => tipController.list(req, reply)
    );

    app.post(
      '/api/v1/identity-providers',
      { preHandler: guard },
      (req, reply) => tipController.create(req, reply)
    );

    app.patch(
      '/api/v1/identity-providers/:id',
      { preHandler: guard },
      (req, reply) => tipController.setEnabled(req, reply)
    );
  }

  // --- Nodes (Gobernanza) ---
  app.post('/api/v1/nodes', { preHandler: guard }, (req, reply) =>
    nodeController.createNode(req, reply)
  );

  app.get('/api/v1/nodes', { preHandler: guard }, (req, reply) =>
    nodeController.listNodesHandler(req, reply)
  );

  // Static route MUST be declared before the parameterised `/nodes/:id`.
  app.get('/api/v1/nodes/subgraph', { preHandler: guard }, (req, reply) =>
    nodeController.getSubgraphHandler(req, reply)
  );

  // The exploration window (roadmap 3.11): also a static route, so it is
  // declared before `/nodes/:id` as well — `window` would otherwise be read
  // as a node id.
  app.get('/api/v1/nodes/window', { preHandler: guard }, (req, reply) =>
    nodeController.getWindowHandler(req, reply)
  );

  // Vector search (FR-19, ADR-0022) — registered before `/nodes/:id` so the
  // more specific path wins.
  app.get('/api/v1/nodes/:id/neighbors', { preHandler: guard }, (req, reply) =>
    nodeController.getNeighborsHandler(req, reply)
  );

  app.get('/api/v1/nodes/:id', { preHandler: guard }, (req, reply) =>
    nodeController.getNodeHandler(req, reply)
  );

  app.delete('/api/v1/nodes/:id', { preHandler: guard }, (req, reply) =>
    nodeController.delete(req, reply)
  );

  // Embedding write-back (FR-18, ADR-0020): the dedicated embedder worker
  // is the only caller. `requireAgentType` runs after the normal guard chain
  // so a human or another agent type gets 403 ERR_AUTHORIZATION_FAILED.
  app.put(
    '/api/v1/nodes/:id/embedding',
    { preHandler: [...guard, requireAgentType('AGENT_EMBEDDER')] },
    (req, reply) => nodeController.setEmbedding(req, reply)
  );

  // --- Edges (RF-08) ---
  app.post('/api/v1/edges', { preHandler: guard }, (req, reply) =>
    edgeController.create(req, reply)
  );

  app.get('/api/v1/edges', { preHandler: guard }, (req, reply) =>
    edgeController.list(req, reply)
  );

  app.get('/api/v1/edges/:id', { preHandler: guard }, (req, reply) =>
    edgeController.get(req, reply)
  );

  app.patch('/api/v1/edges/:id', { preHandler: guard }, (req, reply) =>
    edgeController.update(req, reply)
  );

  app.delete('/api/v1/edges/:id', { preHandler: guard }, (req, reply) =>
    edgeController.delete(req, reply)
  );

  // --- Proposals (Gobernanza / Pull-Request) ---
  app.post('/api/v1/proposals', { preHandler: guard }, (req, reply) =>
    proposalController.create(req, reply)
  );

  app.put('/api/v1/proposals/:id/approve', { preHandler: guard }, (req, reply) =>
    proposalController.approve(req, reply)
  );

  app.put('/api/v1/proposals/:id/reject', { preHandler: guard }, (req, reply) =>
    proposalController.reject(req, reply)
  );

  app.put('/api/v1/proposals/:id/auto-apply', { preHandler: guard }, (req, reply) =>
    proposalController.autoApply(req, reply)
  );

  app.get('/api/v1/proposals', { preHandler: guard }, (req, reply) =>
    proposalController.list(req, reply)
  );

  app.get('/api/v1/proposals/:id', { preHandler: guard }, (req, reply) =>
    proposalController.get(req, reply)
  );

  // --- Ontology metamodel (RF-06/FR-08/FR-09) ---
  app.post('/api/v1/ontology/classes', { preHandler: guard }, (req, reply) =>
    ontologyController.proposeClassHandler(req, reply)
  );

  app.post('/api/v1/ontology/datatype-properties', { preHandler: guard }, (req, reply) =>
    ontologyController.proposeDatatypePropertyHandler(req, reply)
  );

  app.post('/api/v1/ontology/object-properties', { preHandler: guard }, (req, reply) =>
    ontologyController.proposeObjectPropertyHandler(req, reply)
  );

  app.put('/api/v1/ontology/classes/:id/activate', { preHandler: guard }, (req, reply) =>
    ontologyController.activateClassHandler(req, reply)
  );

  app.get('/api/v1/ontology', { preHandler: guard }, (req, reply) =>
    ontologyController.getOntologyHandler(req, reply)
  );

  // --- Discussions (RF-11/FR-16) ---
  app.post('/api/v1/discussions', { preHandler: guard }, (req, reply) =>
    discussionController.createThreadHandler(req, reply)
  );

  app.get('/api/v1/discussions', { preHandler: guard }, (req, reply) =>
    discussionController.listThreadsHandler(req, reply)
  );

  app.post('/api/v1/discussions/:threadId/posts', { preHandler: guard }, (req, reply) =>
    discussionController.addPostHandler(req, reply)
  );

  app.get('/api/v1/discussions/:threadId/posts', { preHandler: guard }, (req, reply) =>
    discussionController.listPostsHandler(req, reply)
  );

  app.put('/api/v1/discussions/:threadId/close', { preHandler: guard }, (req, reply) =>
    discussionController.closeThreadHandler(req, reply)
  );

  app.delete('/api/v1/discussions/posts/:id', { preHandler: guard }, (req, reply) =>
    discussionController.deletePostHandler(req, reply)
  );

  // --- Interactions / Votes (RF-14, RF-15) ---
  app.post('/api/v1/interactions', { preHandler: guard }, (req, reply) =>
    interactionController.vote(req, reply)
  );

  // --- Ingestion (FR-17, ADR-0009, ADR-0025) ---
  // The resolution route is the one protected route without an
  // `X-Workspace-ID`: the workspace is the answer, not an input. It is
  // agent-only and tenant-scoped, and it is rate limited on a fixed scope
  // key because it has no workspace to bucket on.
  app.get(
    '/api/v1/ingestion/resolve-source',
    {
      preHandler: [
        auth,
        tenant,
        scopedRateLimitMiddleware(rateLimiter, 'ingestion'),
        requireSystemAgent(),
      ],
    },
    (req, reply) => ingestionController.resolveSource(req, reply)
  );
}
