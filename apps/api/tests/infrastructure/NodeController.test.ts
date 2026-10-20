import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import type { NodeWindowResponseDto } from '@vozlab/shared-types';
import { ActivateOntologyClassUseCase } from '../../src/application/use_cases/ActivateOntologyClassUseCase.js';
import { AddPostUseCase } from '../../src/application/use_cases/AddPostUseCase.js';
import { ApproveProposalUseCase } from '../../src/application/use_cases/ApproveProposalUseCase.js';
import { AutoApplyProposalUseCase } from '../../src/application/use_cases/AutoApplyProposalUseCase.js';
import { CastVoteUseCase } from '../../src/application/use_cases/CastVoteUseCase.js';
import { CloseThreadUseCase } from '../../src/application/use_cases/CloseThreadUseCase.js';
import { CompleteOidcLoginUseCase } from '../../src/application/use_cases/CompleteOidcLoginUseCase.js';
import { CreateEdgeUseCase } from '../../src/application/use_cases/CreateEdgeUseCase.js';
import { CreateNodeUseCase } from '../../src/application/use_cases/CreateNodeUseCase.js';
import { CreateProposalUseCase } from '../../src/application/use_cases/CreateProposalUseCase.js';
import { CreateThreadUseCase } from '../../src/application/use_cases/CreateThreadUseCase.js';
import { DeleteEdgeUseCase } from '../../src/application/use_cases/DeleteEdgeUseCase.js';
import { DeleteNodeUseCase } from '../../src/application/use_cases/DeleteNodeUseCase.js';
import { DeletePostUseCase } from '../../src/application/use_cases/DeletePostUseCase.js';
import { GetEdgeUseCase } from '../../src/application/use_cases/GetEdgeUseCase.js';
import { GetMeUseCase } from '../../src/application/use_cases/GetMeUseCase.js';
import { GetNodeNeighborsUseCase } from '../../src/application/use_cases/GetNodeNeighborsUseCase.js';
import { GetNodeUseCase } from '../../src/application/use_cases/GetNodeUseCase.js';
import { GetNodeWindowUseCase } from '../../src/application/use_cases/GetNodeWindowUseCase.js';
import { GetOntologyUseCase } from '../../src/application/use_cases/GetOntologyUseCase.js';
import { GetProposalUseCase } from '../../src/application/use_cases/GetProposalUseCase.js';
import { GetSubgraphUseCase } from '../../src/application/use_cases/GetSubgraphUseCase.js';
import { JoinEventUseCase } from '../../src/application/use_cases/JoinEventUseCase.js';
import { ListEdgesUseCase } from '../../src/application/use_cases/ListEdgesUseCase.js';
import { ListNodesUseCase } from '../../src/application/use_cases/ListNodesUseCase.js';
import { ListPostsUseCase } from '../../src/application/use_cases/ListPostsUseCase.js';
import { ListProposalsUseCase } from '../../src/application/use_cases/ListProposalsUseCase.js';
import { ListThreadsUseCase } from '../../src/application/use_cases/ListThreadsUseCase.js';
import { LogoutUseCase } from '../../src/application/use_cases/LogoutUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../src/application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../src/application/use_cases/ProposeObjectPropertyUseCase.js';
import { ProposeOntologyClassUseCase } from '../../src/application/use_cases/ProposeOntologyClassUseCase.js';
import { RefreshSessionUseCase } from '../../src/application/use_cases/RefreshSessionUseCase.js';
import { RejectProposalUseCase } from '../../src/application/use_cases/RejectProposalUseCase.js';
import { ResolveSourceUseCase } from '../../src/application/use_cases/ResolveSourceUseCase.js';
import { SetNodeEmbeddingUseCase } from '../../src/application/use_cases/SetNodeEmbeddingUseCase.js';
import { StartOidcLoginUseCase } from '../../src/application/use_cases/StartOidcLoginUseCase.js';
import { UpdateEdgeUseCase } from '../../src/application/use_cases/UpdateEdgeUseCase.js';
import { Node } from '../../src/domain/entities/Node.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import { NodeController } from '../../src/infrastructure/http/controllers/NodeController.js';
import { registerRoutes, type RouteDependencies } from '../../src/infrastructure/http/routes.js';
import { RateLimitingMiddleware } from '../../src/infrastructure/http/middlewares/RateLimitingMiddleware.js';
import type { RedisTokenBlacklist } from '../../src/infrastructure/events/RedisTokenBlacklist.js';
import { env } from '../../src/shared/config/env.js';
import {
  AUTHOR_HASH,
  TENANT_KEY,
  USER_ID,
  WORKSPACE_ID,
  makeMembershipRepository,
  makeRouterDb,
  makeTokenBlacklist,
} from '../support/authFakes.js';
import { makeEventPublisher, makeNodeRepository, makeOntologyRepository } from '../support/fakes.js';

const TID = 'tenant-1';
const OTHER_WS = '22222222-2222-4222-8222-999999999999';
const AUTHOR = AuthorHash.fromString(AUTHOR_HASH);

function node(id: string, createdAt: string, workspaceId = WORKSPACE_ID): Node {
  const instant = new Date(createdAt);
  return new Node(
    id,
    workspaceId,
    'Problem',
    `Node ${id}`,
    null,
    {},
    AUTHOR,
    'PENDING',
    0,
    instant,
    instant
  );
}

function edge(id: string, sourceNodeId: string, targetNodeId: string): SubgraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    relationKey: 'RELATES_TO',
    status: 'PENDING',
    communityScore: 0,
  };
}

/** The controller under test, wired to an in-memory graph. */
function makeController(nodes: Node[] = [], edges: SubgraphEdge[] = []) {
  const { repo, windowCalls } = makeNodeRepository(nodes, { status: 'NOT_FOUND' }, edges);
  const { repo: ontologyRepo } = makeOntologyRepository();
  const { publisher } = makeEventPublisher();

  const controller = new NodeController(
    new CreateNodeUseCase(repo, ontologyRepo, publisher),
    new GetNodeUseCase(repo),
    new GetNodeNeighborsUseCase(repo),
    new ListNodesUseCase(repo),
    new GetSubgraphUseCase(repo),
    new GetNodeWindowUseCase(repo),
    new DeleteNodeUseCase(repo, publisher),
    new SetNodeEmbeddingUseCase(repo, 'nomic-embed-text')
  );

  return { controller, windowCalls };
}

/** A request as the guards leave it: the identity and the workspace are resolved. */
function makeRequest(query: unknown = {}): FastifyRequest {
  return {
    reqId: 'req-1',
    workspaceId: WORKSPACE_ID,
    tid: TID,
    user: { userId: USER_ID, authorHash: AUTHOR_HASH },
    query,
  } as unknown as FastifyRequest;
}

/** Minimal reply double: it records the status and the body that was sent. */
function makeReply(captured: { statusCode: number; body: unknown }): FastifyReply {
  const reply = {
    status(code: number) {
      captured.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      captured.body = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

async function getWindow(
  controller: NodeController,
  query: unknown = {}
): Promise<{ statusCode: number; body: unknown }> {
  const captured = { statusCode: 0, body: undefined as unknown };
  await controller.getWindowHandler(makeRequest(query), makeReply(captured));
  return captured;
}

/**
 * A use case the route under test never calls. `registerRoutes` only stores
 * the instances it is given, so the prototype is enough to wire the app.
 */
function unused<T extends object>(prototype: T): T {
  return Object.create(prototype) as T;
}

/**
 * The real route table, wired with the window use case and with stubs for
 * everything else: the point of the test is the routing, not the other
 * endpoints.
 */
function makeRouteDependencies(
  nodeRepo: ReturnType<typeof makeNodeRepository>
): RouteDependencies {
  const { routerDb } = makeRouterDb();
  const { membershipRepo } = makeMembershipRepository();
  const { blacklist } = makeTokenBlacklist();
  // The limiter is never connected: the middleware fails open, so no Redis
  // is needed for a routing test.
  const rateLimiter = {
    async isRateLimited() {
      return false;
    },
  } as unknown as RateLimitingMiddleware;

  return {
    createNodeUseCase: unused(CreateNodeUseCase.prototype),
    getNodeUseCase: unused(GetNodeUseCase.prototype),
    getNodeNeighborsUseCase: unused(GetNodeNeighborsUseCase.prototype),
    resolveSourceUseCase: unused(ResolveSourceUseCase.prototype),
    listNodesUseCase: unused(ListNodesUseCase.prototype),
    deleteNodeUseCase: unused(DeleteNodeUseCase.prototype),
    setNodeEmbeddingUseCase: unused(SetNodeEmbeddingUseCase.prototype),
    getSubgraphUseCase: unused(GetSubgraphUseCase.prototype),
    getNodeWindowUseCase: new GetNodeWindowUseCase(nodeRepo.repo),
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
    routerDb,
    membershipRepo,
    // The blacklist is never connected: the guard treats every token as
    // valid, so no Redis is needed for a routing test.
    tokenBlacklist: blacklist as unknown as RedisTokenBlacklist,
    rateLimiter,
  };
}

/** A token the auth guard accepts: a valid signature, an author and a tenant. */
function signToken(): string {
  return jwt.sign(
    { sub: USER_ID, tid: TENANT_KEY, jti: 'jti-1', authorHash: AUTHOR_HASH },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

describe('NodeController — GET /api/v1/nodes/window', () => {
  it('answers 200 with the newest nodes of the workspace and the relations among them', async () => {
    const { controller } = makeController(
      [
        node('n-1', '2026-01-01T00:00:00.000Z'),
        node('n-2', '2026-01-02T00:00:00.000Z'),
      ],
      [edge('e-1', 'n-1', 'n-2')]
    );

    const captured = await getWindow(controller);

    expect(captured.statusCode).toBe(200);
    const body = captured.body as NodeWindowResponseDto;
    expect(body.nodes.map((n) => n.id)).toEqual(['n-2', 'n-1']);
    expect(body.edges).toEqual([
      {
        id: 'e-1',
        sourceNodeId: 'n-1',
        targetNodeId: 'n-2',
        relationKey: 'RELATES_TO',
        status: 'PENDING',
        communityScore: 0,
      },
    ]);
  });

  it('never leaks a node of another workspace', async () => {
    const { controller } = makeController([
      node('mine', '2026-01-01T00:00:00.000Z'),
      node('foreign', '2026-01-02T00:00:00.000Z', OTHER_WS),
    ]);

    const captured = await getWindow(controller);

    const body = captured.body as NodeWindowResponseDto;
    expect(body.nodes.map((n) => n.id)).toEqual(['mine']);
  });

  it('answers an empty workspace with empty collections, not an error', async () => {
    const { controller } = makeController();

    const captured = await getWindow(controller);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ nodes: [], edges: [] });
  });

  it('clamps the limit to 1..200 and defaults to 100', async () => {
    const { controller, windowCalls } = makeController();

    await getWindow(controller);
    await getWindow(controller, { limit: '0' });
    await getWindow(controller, { limit: '1000' });

    expect(windowCalls.map((call) => call.limit)).toEqual([100, 1, 200]);
  });

  it('rejects a limit that is not a number', async () => {
    const { controller, windowCalls } = makeController();

    const captured = await getWindow(controller, { limit: 'many' });

    expect(captured.statusCode).toBe(422);
    expect((captured.body as { code: string }).code).toBe('ERR_VALIDATION_FAILED');
    expect(windowCalls).toHaveLength(0);
  });
});

describe('the route /api/v1/nodes/window', () => {
  it('is answered by the window handler, not by /nodes/:id', async () => {
    const fake = makeNodeRepository(
      [node('n-1', '2026-01-01T00:00:00.000Z')],
      { status: 'NOT_FOUND' },
      []
    );
    const app = Fastify();
    await registerRoutes(app, makeRouteDependencies(fake));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nodes/window',
      headers: {
        authorization: `Bearer ${signToken()}`,
        'x-workspace-id': WORKSPACE_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as NodeWindowResponseDto;
    // The node handler answers `{ node }`; the window answers `{ nodes, edges }`.
    expect(body.nodes.map((n) => n.id)).toEqual(['n-1']);
    expect(body.edges).toEqual([]);

    await app.close();
  });

  it('clamps the limit to the ceiling instead of rejecting it', async () => {
    const fake = makeNodeRepository([], { status: 'NOT_FOUND' }, []);
    const app = Fastify();
    await registerRoutes(app, makeRouteDependencies(fake));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nodes/window?limit=1000',
      headers: {
        authorization: `Bearer ${signToken()}`,
        'x-workspace-id': WORKSPACE_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ nodes: [], edges: [] });
    expect(fake.windowCalls.map((call) => call.limit)).toEqual([200]);

    await app.close();
  });
});
