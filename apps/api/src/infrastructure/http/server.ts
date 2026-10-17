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
import { RedisEventPublisher } from '../events/RedisEventPublisher.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { RateLimitingMiddleware } from './middlewares/RateLimitingMiddleware.js';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase.js';
import { CreateProposalUseCase } from '../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../application/use_cases/AutoApplyProposalUseCase.js';
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
  const createNodeUseCase = new CreateNodeUseCase(nodeRepo, eventPublisher);
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
    proposalRepo,
    membershipRepo,
    uow,
    eventPublisher
  );

  // --- Routes ---
  await registerRoutes(app, {
    createNodeUseCase,
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase,
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
