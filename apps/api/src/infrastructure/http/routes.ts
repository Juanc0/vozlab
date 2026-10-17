import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { RedisTokenBlacklist } from '../events/RedisTokenBlacklist.js';
import { authGuard } from './middlewares/AuthGuard.js';
import { tenantWorkspaceGuard } from './middlewares/TenantWorkspaceGuard.js';
import { RateLimitingMiddleware, rateLimitMiddleware } from './middlewares/RateLimitingMiddleware.js';
import { NodeController } from './controllers/NodeController.js';
import { EdgeController } from './controllers/EdgeController.js';
import { ProposalController } from './controllers/ProposalController.js';
import { OntologyController } from './controllers/OntologyController.js';
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
    autoApplyProposalUseCase
  );
  const ontologyController = new OntologyController(
    proposeOntologyClassUseCase,
    proposeDatatypePropertyUseCase,
    proposeObjectPropertyUseCase,
    activateOntologyClassUseCase,
    getOntologyUseCase
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

  app.get('/api/v1/proposals', { preHandler: guard }, async (_req, reply) => {
    return reply.status(200).send({ proposals: [] });
  });

  app.get('/api/v1/proposals/:id', { preHandler: guard }, async (_req, reply) => {
    return reply.status(200).send({ proposal: null });
  });

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
}
