import { randomUUID } from 'node:crypto';
import Fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/logger/index.js';
import { registerRoutes } from './routes.js';
import { correlationGuard, sendCorrelationHeader } from './middlewares/CorrelationGuard.js';
import { DrizzleNodeRepository } from '../persistence/repositories/DrizzleNodeRepository.js';
import { DrizzleEdgeRepository } from '../persistence/repositories/DrizzleEdgeRepository.js';
import { DrizzleOntologyRepository } from '../persistence/repositories/DrizzleOntologyRepository.js';
import { DrizzleProposalRepository } from '../persistence/repositories/DrizzleProposalRepository.js';
import { DrizzleMembershipRepository } from '../persistence/repositories/DrizzleMembershipRepository.js';
import { DrizzleDiscussionRepository } from '../persistence/repositories/DrizzleDiscussionRepository.js';
import { RedisEventPublisher } from '../events/RedisEventPublisher.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { RateLimitingMiddleware } from './middlewares/RateLimitingMiddleware.js';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../application/use_cases/GetNodeUseCase.js';
import { GetSubgraphUseCase } from '../../application/use_cases/GetSubgraphUseCase.js';
import { ListNodesUseCase } from '../../application/use_cases/ListNodesUseCase.js';
import { CreateProposalUseCase } from '../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../application/use_cases/AutoApplyProposalUseCase.js';
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

  // --- Adapters (infrastructure) ---
  const routerDb = new RouterDatabaseClient();
  const poolManager = new ConnectionPoolManager(routerDb);
  const nodeRepo = new DrizzleNodeRepository(poolManager);
  const edgeRepo = new DrizzleEdgeRepository(poolManager);
  const ontologyRepo = new DrizzleOntologyRepository(poolManager);
  const proposalRepo = new DrizzleProposalRepository(poolManager);
  const membershipRepo = new DrizzleMembershipRepository(poolManager);
  const discussionRepo = new DrizzleDiscussionRepository(poolManager);
  const uow = new UnitOfWork(poolManager);
  const eventPublisher = new RedisEventPublisher();
  const tokenBlacklist = new RedisTokenBlacklist();
  const rateLimiter = new RateLimitingMiddleware();

  // Connect Redis-backed services.
  await tokenBlacklist.connect();
  await eventPublisher.connect();
  await rateLimiter.connect();

  // Start TTL-based eviction of idle tenant pools.
  poolManager.startCleanupInterval();

  // --- Use cases (application) ---
  const createNodeUseCase = new CreateNodeUseCase(nodeRepo, ontologyRepo, eventPublisher);
  const getNodeUseCase = new GetNodeUseCase(nodeRepo);
  const listNodesUseCase = new ListNodesUseCase(nodeRepo);
  const getSubgraphUseCase = new GetSubgraphUseCase(nodeRepo);
  const createProposalUseCase = new CreateProposalUseCase(proposalRepo, eventPublisher);
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
  const createEdgeUseCase = new CreateEdgeUseCase(
    edgeRepo,
    nodeRepo,
    ontologyRepo,
    eventPublisher
  );
  const getEdgeUseCase = new GetEdgeUseCase(edgeRepo);
  const listEdgesUseCase = new ListEdgesUseCase(edgeRepo);
  const updateEdgeUseCase = new UpdateEdgeUseCase(edgeRepo, eventPublisher);
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

  // --- Routes ---
  await registerRoutes(app, {
    createNodeUseCase,
    getNodeUseCase,
    listNodesUseCase,
    getSubgraphUseCase,
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase,
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
