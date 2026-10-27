import { randomUUID } from 'node:crypto';
import Fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { env } from '../../shared/config/env.js';
import { durationToMs } from '../../shared/time/duration.js';
import { logger } from '../../shared/logger/index.js';
import { registerRoutes } from './routes.js';
import { correlationGuard, sendCorrelationHeader } from './middlewares/CorrelationGuard.js';
import { DrizzleNodeRepository } from '../persistence/repositories/DrizzleNodeRepository.js';
import { DrizzleDataSourceRepository } from '../persistence/repositories/DrizzleDataSourceRepository.js';
import { DrizzleEdgeRepository } from '../persistence/repositories/DrizzleEdgeRepository.js';
import { DrizzleOntologyRepository } from '../persistence/repositories/DrizzleOntologyRepository.js';
import { DrizzleProposalRepository } from '../persistence/repositories/DrizzleProposalRepository.js';
import { DrizzleMembershipRepository } from '../persistence/repositories/DrizzleMembershipRepository.js';
import { DrizzleInvitationRepository } from '../persistence/repositories/DrizzleInvitationRepository.js';
import { DrizzleDiscussionRepository } from '../persistence/repositories/DrizzleDiscussionRepository.js';
import { DrizzleInteractionRepository } from '../persistence/repositories/DrizzleInteractionRepository.js';
import { DrizzleUserRepository } from '../persistence/repositories/DrizzleUserRepository.js';
import { DrizzleRefreshTokenRepository } from '../persistence/repositories/DrizzleRefreshTokenRepository.js';
import { RedisEventPublisher } from '../events/RedisEventPublisher.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { JwtTokenIssuer } from '../identity/JwtTokenIssuer.js';
import { OidcProviderClient } from '../identity/OidcProviderClient.js';
import { RedisOidcStateStore } from '../identity/RedisOidcStateStore.js';
import { RateLimitingMiddleware } from './middlewares/RateLimitingMiddleware.js';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../application/use_cases/GetNodeUseCase.js';
import { GetNodeNeighborsUseCase } from '../../application/use_cases/GetNodeNeighborsUseCase.js';
import { ResolveSourceUseCase } from '../../application/use_cases/ResolveSourceUseCase.js';
import { GetSubgraphUseCase } from '../../application/use_cases/GetSubgraphUseCase.js';
import { GetNodeWindowUseCase } from '../../application/use_cases/GetNodeWindowUseCase.js';
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
import { DisplayNameCatalog } from '../../application/use_cases/DisplayNameCatalog.js';
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
import { RouterDatabaseClient } from '../persistence/RouterDatabaseClient.js';
import { ConnectionPoolManager } from '../persistence/ConnectionPoolManager.js';
import { UnitOfWork } from '../persistence/UnitOfWork.js';

/**
 * Composition Root: wire up adapters and use cases at application startup.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'reqId',
    genReqId: () => randomUUID(),
  });

  // --- Hooks ---
  app.addHook('onRequest', correlationGuard);
  app.addHook('onSend', sendCorrelationHeader);

  // --- HTTP plugins ---
  // `credentials: true` is required for the refresh cookie; the origin is an
  // exact match (no wildcard) so the browser can send credentials.
  await app.register(cors, {
    origin: new URL(env.WEB_ORIGIN).origin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Workspace-ID',
      'x-correlation-id',
    ],
  });
  await app.register(cookie);

  // --- Adapters (infrastructure) ---
  const routerDb = new RouterDatabaseClient();
  const poolManager = new ConnectionPoolManager(routerDb);
  const nodeRepo = new DrizzleNodeRepository(poolManager);
  const dataSourceRepo = new DrizzleDataSourceRepository(poolManager);
  const edgeRepo = new DrizzleEdgeRepository(poolManager);
  const ontologyRepo = new DrizzleOntologyRepository(poolManager);
  const proposalRepo = new DrizzleProposalRepository(poolManager);
  const membershipRepo = new DrizzleMembershipRepository(poolManager);
  const discussionRepo = new DrizzleDiscussionRepository(poolManager);
  const interactionRepo = new DrizzleInteractionRepository(poolManager);
  const uow = new UnitOfWork(poolManager);
  const eventPublisher = new RedisEventPublisher();
  const tokenBlacklist = new RedisTokenBlacklist();
  const rateLimiter = new RateLimitingMiddleware();
  const userRepo = new DrizzleUserRepository(poolManager);
  const refreshTokenRepo = new DrizzleRefreshTokenRepository(poolManager);
  const identityProvider = new OidcProviderClient();
  const oidcStateStore = new RedisOidcStateStore();
  const tokenIssuer = new JwtTokenIssuer();
  const refreshTtlMs = durationToMs(env.JWT_REFRESH_EXPIRES_IN);

  // Connect Redis-backed services.
  await tokenBlacklist.connect();
  await eventPublisher.connect();
  await rateLimiter.connect();
  await oidcStateStore.connect();

  // Start TTL-based eviction of idle tenant pools.
  poolManager.startCleanupInterval();

  // --- Use cases (application) ---
  // The catalog of the display names of the metamodel: the graph DTOs carry
  // the names of the classes and of the relations, read once per answer.
  const displayNames = new DisplayNameCatalog(ontologyRepo);
  const createNodeUseCase = new CreateNodeUseCase(nodeRepo, ontologyRepo, eventPublisher);
  const getNodeUseCase = new GetNodeUseCase(nodeRepo, displayNames);
  const getNodeNeighborsUseCase = new GetNodeNeighborsUseCase(nodeRepo, displayNames);
  const resolveSourceUseCase = new ResolveSourceUseCase(dataSourceRepo);
  const listNodesUseCase = new ListNodesUseCase(nodeRepo, displayNames);
  const getSubgraphUseCase = new GetSubgraphUseCase(nodeRepo, displayNames);
  const getNodeWindowUseCase = new GetNodeWindowUseCase(nodeRepo, displayNames);
  const deleteNodeUseCase = new DeleteNodeUseCase(nodeRepo, eventPublisher);
  const setNodeEmbeddingUseCase = new SetNodeEmbeddingUseCase(
    nodeRepo,
    env.EMBEDDING_MODEL
  );
  const createProposalUseCase = new CreateProposalUseCase(
    proposalRepo,
    interactionRepo,
    ontologyRepo,
    nodeRepo,
    eventPublisher
  );
  const approveProposalUseCase = new ApproveProposalUseCase(
    nodeRepo,
    edgeRepo,
    ontologyRepo,
    proposalRepo,
    uow,
    eventPublisher
  );
  const rejectProposalUseCase = new RejectProposalUseCase(
    nodeRepo,
    edgeRepo,
    ontologyRepo,
    proposalRepo,
    uow,
    eventPublisher
  );
  const autoApplyProposalUseCase = new AutoApplyProposalUseCase(
    nodeRepo,
    edgeRepo,
    ontologyRepo,
    proposalRepo,
    membershipRepo,
    uow,
    eventPublisher
  );
  const listProposalsUseCase = new ListProposalsUseCase(proposalRepo);
  const getProposalUseCase = new GetProposalUseCase(proposalRepo);
  const createEdgeUseCase = new CreateEdgeUseCase(
    edgeRepo,
    nodeRepo,
    ontologyRepo,
    eventPublisher
  );
  const getEdgeUseCase = new GetEdgeUseCase(edgeRepo, displayNames);
  const listEdgesUseCase = new ListEdgesUseCase(edgeRepo, displayNames);
  const updateEdgeUseCase = new UpdateEdgeUseCase(edgeRepo, eventPublisher, displayNames);
  const deleteEdgeUseCase = new DeleteEdgeUseCase(edgeRepo, eventPublisher);
  const proposeOntologyClassUseCase = new ProposeOntologyClassUseCase(
    ontologyRepo,
    eventPublisher
  );
  const proposeDatatypePropertyUseCase = new ProposeDatatypePropertyUseCase(
    ontologyRepo,
    eventPublisher
  );
  const proposeObjectPropertyUseCase = new ProposeObjectPropertyUseCase(
    ontologyRepo,
    eventPublisher
  );
  const activateOntologyClassUseCase = new ActivateOntologyClassUseCase(
    ontologyRepo,
    membershipRepo,
    uow,
    eventPublisher
  );
  const getOntologyUseCase = new GetOntologyUseCase(ontologyRepo);
  const createThreadUseCase = new CreateThreadUseCase(discussionRepo, eventPublisher);
  const addPostUseCase = new AddPostUseCase(discussionRepo, eventPublisher);
  const listThreadsUseCase = new ListThreadsUseCase(discussionRepo);
  const listPostsUseCase = new ListPostsUseCase(discussionRepo);
  const closeThreadUseCase = new CloseThreadUseCase(discussionRepo, eventPublisher);
  const deletePostUseCase = new DeletePostUseCase(discussionRepo, eventPublisher);
  const castVoteUseCase = new CastVoteUseCase(interactionRepo, uow, eventPublisher);
  const startOidcLoginUseCase = new StartOidcLoginUseCase(
    identityProvider,
    oidcStateStore,
    routerDb
  );
  const invitationRepo = new DrizzleInvitationRepository(poolManager);
  const completeOidcLoginUseCase = new CompleteOidcLoginUseCase(
    oidcStateStore,
    identityProvider,
    routerDb,
    routerDb,
    userRepo,
    invitationRepo,
    membershipRepo,
    refreshTokenRepo,
    refreshTtlMs
  );
  const refreshSessionUseCase = new RefreshSessionUseCase(
    routerDb,
    userRepo,
    refreshTokenRepo,
    tokenIssuer,
    refreshTtlMs
  );
  const logoutUseCase = new LogoutUseCase(
    tokenBlacklist,
    routerDb,
    refreshTokenRepo
  );
  const getMeUseCase = new GetMeUseCase(userRepo);
  const joinEventUseCase = new JoinEventUseCase(
    routerDb,
    routerDb,
    userRepo,
    membershipRepo,
    refreshTokenRepo,
    tokenIssuer,
    uow,
    refreshTtlMs
  );

  // --- Routes ---
  await registerRoutes(app, {
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
  });

  // --- Graceful shutdown ---
  app.addHook('onClose', async () => {
    await tokenBlacklist.disconnect();
    await eventPublisher.disconnect();
    await rateLimiter.disconnect();
    await oidcStateStore.disconnect();
    poolManager.stopCleanupInterval();
    await poolManager.destroyAll();
    logger.info('Adapter connections closed');
  });

  return app;
}

/**
 * Start the server (used by the entry point).
 */
export async function startServer(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`VozLab API server running on http://${env.HOST}:${env.PORT}`);
  return app;
}
