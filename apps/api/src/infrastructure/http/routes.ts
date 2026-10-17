import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase.js';
import { GetNodeUseCase } from '../../application/use_cases/GetNodeUseCase.js';
import { GetSubgraphUseCase } from '../../application/use_cases/GetSubgraphUseCase.js';
import { ListNodesUseCase } from '../../application/use_cases/ListNodesUseCase.js';
import { CreateProposalUseCase } from '../../application/use_cases/CreateProposalUseCase.js';
import { ApproveProposalUseCase } from '../../application/use_cases/ApproveProposalUseCase.js';
import { RejectProposalUseCase } from '../../application/use_cases/RejectProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../application/use_cases/AutoApplyProposalUseCase.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { authGuard } from './middlewares/AuthGuard.js';
import { tenantWorkspaceGuard } from './middlewares/TenantWorkspaceGuard.js';
import { RateLimitingMiddleware, rateLimitMiddleware } from './middlewares/RateLimitingMiddleware.js';
import { NodeController } from './controllers/NodeController.js';
import { ProposalController } from './controllers/ProposalController.js';
import { HealthController } from './controllers/HealthController.js';

/**
 * Dependencies required to register routes (manual Composition Root).
 */
export interface RouteDependencies {
  createNodeUseCase: CreateNodeUseCase;
  getNodeUseCase: GetNodeUseCase;
  listNodesUseCase: ListNodesUseCase;
  getSubgraphUseCase: GetSubgraphUseCase;
  createProposalUseCase: CreateProposalUseCase;
  approveProposalUseCase: ApproveProposalUseCase;
  rejectProposalUseCase: RejectProposalUseCase;
  autoApplyProposalUseCase: AutoApplyProposalUseCase;
  routerDb: IRouterDatabase;
  membershipRepo: IMembershipRepository;
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
    listNodesUseCase,
    getSubgraphUseCase,
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase,
    routerDb,
    membershipRepo,
    tokenBlacklist,
    rateLimiter,
  } = deps;

  const nodeController = new NodeController(
    createNodeUseCase,
    getNodeUseCase,
    listNodesUseCase,
    getSubgraphUseCase
  );
  const proposalController = new ProposalController(
    createProposalUseCase,
    approveProposalUseCase,
    rejectProposalUseCase,
    autoApplyProposalUseCase
  );
  const healthController = new HealthController(routerDb, tokenBlacklist);

  // --- Public: Health probes ---
  app.get('/health', (req, reply) => healthController.live(req, reply));
  app.get('/health/live', (req, reply) => healthController.live(req, reply));
  app.get('/health/ready', (req, reply) => healthController.ready(req, reply));

  // --- Protected chain ---
  const auth = authGuard(tokenBlacklist);
  const workspace = (req: FastifyRequest, reply: FastifyReply) =>
    tenantWorkspaceGuard(req, reply, { routerDb, membershipRepo });
  const limit = rateLimitMiddleware(rateLimiter);
  const guard = [auth, workspace, limit];

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

  app.get('/api/v1/nodes/:id', { preHandler: guard }, (req, reply) =>
    nodeController.getNodeHandler(req, reply)
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

  app.get('/api/v1/proposals', { preHandler: guard }, async (_req, reply) => {
    return reply.status(200).send({ proposals: [] });
  });

  app.get('/api/v1/proposals/:id', { preHandler: guard }, async (_req, reply) => {
    return reply.status(200).send({ proposal: null });
  });
}
