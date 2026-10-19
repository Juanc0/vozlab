---
title: "Module Specification: Fastify Backend, Hexagonal Architecture and Boilerplate Guide"
version: 1.0.0
status: APPROVED
target_component: Backend API (Node.js / TypeScript)
owner: Backend & Architecture Team (VozLab)
---

# 02. FASTIFY BACKEND, HEXAGONAL ARCHITECTURE AND BOILERPLATE GUIDE

## 1. Code Organization by Layers (Layer-First / Hexagonal)

The VozLab backend (`apps/api/`) is organized into isolated concentric layers. The **Domain** layer has no knowledge of HTTP, Fastify, Drizzle ORM or databases.


```

apps/api/src/
├── domain/                         <-- Pure Entities, Value Objects and Errors
│   ├── entities/                   <-- Node.ts, EditProposal.ts, OntologyClass.ts
│   ├── value_objects/              <-- AuthorHash.ts, SystemKey.ts, VoteValue.ts
│   └── ports/                      <-- Pure TypeScript Interfaces (Repositories and Services)
│       ├── INodeRepository.ts
│       ├── IProposalRepository.ts
│       └── IEventPublisher.ts
│
├── application/                    <-- Use Cases (Agnostic Business Logic)
│   ├── use_cases/                  <-- CreateNodeUseCase.ts, ApproveProposalUseCase.ts
│   └── dtos/                       <-- Input/output data transfer objects
│
├── infrastructure/                 <-- Concrete infrastructure adapters
│   ├── http/                       <-- Fastify Server, Plugins, Routes and Controllers
│   │   ├── controllers/            <-- HTTP Handlers (NodeController.ts)
│   │   ├── middlewares/            <-- AuthGuard.ts, TenantWorkspaceGuard.ts
│   │   └── routes/                 <-- Fastify routers by domain (/nodes, /proposals)
│   ├── persistence/                <-- Drizzle ORM (PostgreSQL) and Apache AGE (Cypher)
│   │   ├── repositories/           <-- DrizzleNodeRepository.ts, AgeGraphRepository.ts
│   │   └── unit_of_work.ts         <-- Atomic transaction implementation
│   └── events/                     <-- Redis Streams adapter (RedisEventPublisher.ts)
│
└── shared/                         <-- Cross-cutting utilities
├── config/                     <-- Strict environment validation with Zod (env.ts)
└── logger/                     <-- Pino structured Logger with Correlation ID

```

**Vote scoring value object.** `domain/value_objects/VoteValue.ts` is the one and
only place that maps an `interactionType` to a numeric score delta (RF-14):
`DOWNVOTE -> -1`, `UPVOTE | SUPPORT | VALIDATE -> +1`. The integer is
**server-derived and persisted** (`interactions_log.value`); it is never accepted
from the client. `CastVoteUseCase` derives it via
`VoteValue.fromInteractionType(...)` before writing the interaction and the
synchronous counter increment.

---

## 2. Server Initialization and Manual Composition (Composition Root)

To avoid the complexity and overhead of heavy IoC containers, dependencies are injected explicitly using the **Composition Root** pattern when Fastify starts:

```typescript
// apps/api/src/infrastructure/http/server.ts
import Fastify from 'fastify';
import { env } from '../../shared/config/env';
import { logger } from '../../shared/logger';
import { registerRoutes } from './routes';
import { DrizzleNodeRepository } from '../persistence/repositories/DrizzleNodeRepository';
import { RedisEventPublisher } from '../events/RedisEventPublisher';
import { CreateNodeUseCase } from '../../application/use_cases/CreateNodeUseCase';

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'reqId',
  });

  // 1. Adapter Instantiation (Infrastructure)
  const nodeRepo = new DrizzleNodeRepository();
  const eventPublisher = new RedisEventPublisher();

  // 2. Dependency Injection into Use Cases (Application)
  const createNodeUseCase = new CreateNodeUseCase(nodeRepo, eventPublisher);

  // 3. Registration of Injected Routes
  await registerRoutes(app, { createNodeUseCase });

  return app;
}

```

---

## 3. Security Middlewares and Multi-Tenant Control

### 3.1. TenantWorkspaceGuard (`TenantWorkspaceGuard.ts`)

Validates in a *stateless* way that the authenticated user has an active membership on the Workspace indicated in the `X-Workspace-ID` header:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantWorkspaceGuard(req: FastifyRequest, reply: FastifyReply) {
  const workspaceId = req.headers['x-workspace-id'] as string;
  const user = req.user; // Injected by AuthGuard (JWT Cookie)

  if (!workspaceId) {
    return reply.status(400).send({
      status: 'error',
      code: 'ERR_MISSING_WORKSPACE_HEADER',
      message: 'Header X-Workspace-ID is required for this request',
    });
  }

  // Membership validation in the Database (with optional Redis cache)
  const hasAccess = await verifyUserWorkspaceMembership(user.id, workspaceId);
  if (!hasAccess) {
    return reply.status(403).send({
      status: 'error',
      code: 'ERR_UNAUTHORIZED_WORKSPACE_ACCESS',
      message: 'User does not belong to the requested workspace',
    });
  }
  
  req.workspaceId = workspaceId;
}

```

### 3.2. System-Agent (AI worker) Identity Contract (FR-17, US-07)

The three Python workers (Extractor, Relator, Consolidator) authenticate against
the same REST endpoints as humans, but as **bots**. Their identity is an HS256
JWT carrying the claims below; `AuthGuard` reads the allowlist from
`AgentTypeSchema` (`packages/shared-types/src/schemas/agent.schema.ts`) — the
single source of truth for the three agent types.

| Claim | Required | Meaning |
| --- | --- | --- |
| `sub` | yes (all callers) | Identity UUID. For a worker it is the seeded `SYSTEM_AGENT` row in `auth.users` (audit trail). |
| `tid` | yes | OIDC tenant id; must match `tenants.oidc_tenant_id` in the router DB, otherwise `403 ERR_TENANT_NOT_PROVISIONED`. |
| `jti` | yes | Unique token id; the Redis blacklist key used for O(1) revocation. |
| `authorHash` | yes for agents | 64-hex pseudonymous author (FR-12). Taken verbatim when present, otherwise derived deterministically from `sub` + `AUTHOR_HASH_SALT`, so it is stable per agent. |
| `type` | yes for agents | One of `AGENT_EXTRACTOR` \| `AGENT_RELACIONADOR` \| `AGENT_CONSOLIDADOR`. Any other value → `401 ERR_INVALID_TOKEN` (an unknown bot is never treated as a human). |

Behaviour:

- An agent **must still send `X-Workspace-ID`** and its `tid` must resolve in the
  router DB; it is scoped to a workspace exactly like a human.
- Workspace **membership is skipped** for agents: they are platform actors, not
  members, and never appear in `auth.workspace_memberships` (FR-05).
- Agents receive **no implicit role**: moderator/admin-gated actions stay
  role-gated and will reject an agent that lacks the role.
- Agents mutate the graph only through the public API — `POST /api/v1/nodes`
  and `POST /api/v1/proposals` — **never via direct DB writes**.

```bash
# Local example: mint an agent token and create a node as the bot.
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as agent | tail -1)
curl -s -X POST localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333" \
  -H 'content-type: application/json' \
  -d '{"typeKey":"Problem","title":"agent-created"}'
```

### 3.3. Author hash & salt

`author_hash = SHA-256(identity + salt)` is the pseudonymous public identity
(NFR-07). `resolveAuthorHash(raw, subject, tenantId?)`
(`application/services/resolveAuthorHash.ts`) is the **only** reader of the
salt:

- a token that already carries a valid 64-hex `authorHash` is preserved
  verbatim — never re-hashed (TASK-19/20; also keeps `db:seed:dev` /
  `db:mint-token` values working, since those use `sha256('dev-<name>')`
  without the salt);
- otherwise the hash is derived deterministically from `sub` + salt.

The salt is **per institution**, not per user/workspace. `tenantId` is optional
today and resolves to the global `env.AUTHOR_HASH_SALT`; a future `SaltProvider`
will resolve `tenantId -> salt` from the router DB. Because the pseudonym is
*stored* on rows and *compared* for authorization (FR-12) and the vote
uniqueness constraint (FR-14/15), **rotating the salt is a data migration, not a
config change** — see `docs/system/system_04_*` §3.1.1 for the runbook and the
deferred per-tenant/versioned milestone (`EXECUTION_PLAN.md` → Deferred).
`env.ts` rejects the `.env.example` placeholder and any salt < 32 chars when
`NODE_ENV=production` (≥ 16 elsewhere).

---

## 4. Use Case and Transaction Implementation (`UnitOfWork`)

Example of a protected Use Case that executes atomic mutations across multiple tables and emits an asynchronous event:

```typescript
// apps/api/src/application/use_cases/ApproveProposalUseCase.ts
import { INodeRepository } from '../../domain/ports/INodeRepository';
import { IProposalRepository } from '../../domain/ports/IProposalRepository';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork';
import { IEventPublisher } from '../../domain/ports/IEventPublisher';

export class ApproveProposalUseCase {
  constructor(
    private nodeRepo: INodeRepository,
    private proposalRepo: IProposalRepository,
    private uow: IUnitOfWork,
    private eventPublisher: IEventPublisher
  ) {}

  async execute(proposalId: string, authorHash: string, workspaceId: string): Promise<void> {
    const proposal = await this.proposalRepo.findById(proposalId);
    if (!proposal) throw new Error('ERR_PROPOSAL_NOT_FOUND');

    // Atomic multi-table transaction
    await this.uow.runInTransaction(async (tx) => {
      // 1. Applies the delta to the main node
      await this.nodeRepo.applyDelta(proposal.targetId, proposal.proposedChanges, workspaceId, tx);
      
      // 2. Updates the proposal status
      await this.proposalRepo.updateStatus(proposalId, 'APPROVED_BY_AUTHOR', authorHash, tx);
    });

    // 3. Emits asynchronous event to Redis Streams (outside the DB transaction)
    await this.eventPublisher.publish('proposal:approved', {
      proposalId,
      targetId: proposal.targetId,
      workspaceId,
    });
  }
}

```

---

## 5. Strict Edge Validation with Zod

All HTTP input parameters (Body, Query Params, Headers) are validated using Zod schemas integrated directly into Fastify:

```typescript
import { z } from 'zod';

export const CreateNodeSchema = z.object({
  typeKey: z.string().max(100),
  title: z.string().min(3).max(255),
  description: z.string().optional(),
  attributes: z.record(z.any()).default({}),
});

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

```

---

## 6. Implementation Status — MILESTONE-1.4 (Zero-Trust) ✅

> Date: 2026-10-14 · Validated with `pnpm turbo run build` (3/3 packages)

### 6.1. Middleware Chain (execution order)

`onRequest` → `preHandler` → handler:

```
CorrelationGuard (onRequest)        -> injects reqId (x-correlation-id)
AuthGuard (preHandler)              -> JWT + O(1) Redis blacklist + system agents
TenantWorkspaceGuard (preHandler)   -> X-Workspace-ID + provisioned tenant (router DB)
RateLimitingMiddleware (preHandler) -> Redis bucket per tid+workspace+method
```

### 6.2. Concrete files

| File | Role |
| --- | --- |
| `src/infrastructure/http/middlewares/AuthGuard.ts` | Verifies Bearer JWT (HS256), checks the `jti` blacklist and attaches `req.user` / `req.oidcTenantId`. Detects agents (`AGENT_EXTRACTOR`…). |
| `src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts` | Requires `X-Workspace-ID` (UUID), validates the tenant in `vozlab_router` and attaches `req.tid` / `req.workspaceId` / `req.tenantSlug`. |
| `src/infrastructure/http/middlewares/RateLimitingMiddleware.ts` | NFR-08: reads 300/min, writes 30/min per tenant+workspace. Fail-open on Redis error. |
| `src/infrastructure/events/RedisTokenBlacklist.ts` | Token revocation with TTL = remaining lifetime of the JWT (O(1)). |
| `src/infrastructure/persistence/ConnectionPoolManager.ts` | Physical pool per `tid` with TTL (30 min) and periodic eviction; consumed by `UnitOfWork`. |
| `src/infrastructure/http/controllers/{Node,Health}Controller.ts` | HTTP adapters (node creation, `live`/`ready` probes). |
| `src/infrastructure/http/routes.ts` | Routes Composition Root; applies the guard chain to protected routes. |
| `src/types/fastify.d.ts` | Augmentation of `FastifyRequest` (identity/tenant) without `any` casts. |

### 6.3. Layer contracts (Domain → Infrastructure)

The ports expose `tid` because each institution has its own physical database:

```typescript
export interface INodeRepository {
  findById(id: string, tid: string): Promise<Node | null>;
  save(node: Node, tid: string, tx?: any): Promise<void>;
  update(node: Node, tid: string, tx?: any): Promise<void>;
  applyDelta(targetId: string, proposedChanges: Record<string, any>, workspaceId: string, tid: string, tx?: any): Promise<void>;
}

export interface IUnitOfWork {
  runInTransaction<T>(tid: string, work: (tx: any) => Promise<T>): Promise<T>;
}
```

### 6.4. Verified acceptance criteria

- [x] Request without `X-Workspace-ID` → **400** `ERR_MISSING_WORKSPACE_HEADER`.
- [x] `tid` absent in `vozlab_router` → **403** `ERR_TENANT_NOT_PROVISIONED`.
- [x] Token in Redis blacklist → **401** `ERR_TOKEN_BLACKLISTED` in O(1).
- [x] Rate limiting per tenant/workspace backed by Redis.

### 6.5. Deviation note regarding the initial draft

The pool manager was consolidated into **`ConnectionPoolManager`** (already consumed by `UnitOfWork`),
instead of creating a second manager. This keeps a single source of truth for the
multi-tenant physical isolation.

### 6.6. Workspace scoping of id-addressed operations

Physical tenant isolation (`tid` → one DB per institution) is necessary but not
sufficient: inside a single tenant, **every read or mutation that addresses an
existing object by id must also be scoped to the request workspace**
(`X-Workspace-ID` → `ctx.workspaceId`). A caller in workspace A must never be
able to read, mutate, or bridge to an object that lives in workspace B.

The rule applies to:

- **Edges** — both endpoints of a new edge must be in the request workspace
  (`CreateEdgeUseCase`); a foreign endpoint yields `ERR_NODE_NOT_FOUND`.
- **Proposals** — `proposal.workspaceId` is compared to the request workspace
  *before* any maintainer/role check, in approve, reject and auto-apply
  (`ERR_PROPOSAL_NOT_FOUND` on mismatch).
- **Discussions** — `findThreadById` stays id-only (single round-trip, adapter
  concern), but every consumer (`CloseThreadUseCase`, `AddPostUseCase`,
  `ListPostsUseCase`) compares `thread.workspaceId` and yields
  `ERR_THREAD_NOT_FOUND` on mismatch.
- **Ontology** — `findClassById`, `applyClassDelta` and `activateClass` all take
  a `workspaceId` and filter on it, so a class from another workspace can never
  be read or mutated.

**A workspace mismatch is reported as 404 (`ERR_*_NOT_FOUND`), never 403**
(`ERR_AUTHORIZATION_FAILED`): a 403 would confirm that the object exists in
another workspace and leak its existence.

### 6.7. Timestamp ownership (TASK-38)

Two writers must never stamp the same column. The rule is:

> **The domain owns the business timestamps (`created_at`, `updated_at`);
> the adapter owns `deleted_at`.**

| Concern | Single writer | Detail |
| --- | --- | --- |
| **Creates** | Domain entity | The use case builds the entity; the entity's constructor sets `createdAt`/`updatedAt` (or they default to `new Date()`); the adapter only persists those values (`save`/`savePost`/`saveThread`). |
| **Updates / approved deltas** | Domain method | `Node.changeStatus` / `Node.updateAttributes` (and the equivalent methods on other entities) bump `updatedAt`. The adapter persists `entity.updatedAt` verbatim — it must **never** call `new Date()` in an `UPDATE`. |
| **Soft-deletes** | Adapter | `deleted_at` is a pure persistence concern. `softDelete` / `softDeletePost` stamp it; use cases never touch it. The domain entity exposes `deletedAt` as a **read-only** projection (mapping a row back), not as mutable state, and carries no `softDelete()` method. |
| **Reads** | Adapter | Adapters filter `deleted_at IS NULL`; use cases enforce workspace/authorization on the entity they receive. |

Consequences worth calling out:

- `DrizzleNodeRepository.update` persists `node.updatedAt` (no `new Date()`),
  so the domain and the row can never disagree.
- `DrizzleNodeRepository.applyDelta` receives only `proposedChanges`, not an
  entity. It already loads the row, so it rebuilds the entity with `toDomain`,
  routes the delta through `updateAttributes`, and persists the resulting
  `node.updatedAt` — still a single `UPDATE`. There is **no** documented
  `new Date()` exception in the node adapter.
- `savePost` does not pass `deletedAt` in its `INSERT`; a fresh post is always
  active and the column takes its `NULL` default. `softDeletePost` is the only
  writer of `deleted_at`.

Verified with:

```bash
grep -rn "updatedAt: new Date()" apps/api/src   # → no matches
grep -rn "softDelete()" apps/api/src/domain     # → no matches
```

### 6.8. Port vocabulary (TASK-39)

Repository ports (`domain/ports/*.ts`) use one shared set of method-name
prefixes so a new adapter never invents its own wording. The grammar is:

| Verb | Meaning | Return shape |
| --- | --- | --- |
| `find…` | Load **one** object; absent → `null`. | `T \| null` |
| `list…` | Load a **collection** (paginated or not). | `T[]` or `{ items, nextCursor }` |
| `save` | Insert a **new** entity. | `void` |
| `update` | Persist a **mutated** entity (or its changed fields). | `void` |
| `softDelete` | Stamp `deleted_at` on the port's aggregate. | `void` |
| `apply…Delta` | Merge an approved proposal's delta into an aggregate. | `void` |

Disambiguation suffixes, appended only when the scope is **not** the
signature's first argument:

- `…ById` — addressed by primary key (`findById`, `findPostById`,
  `findThreadById`, `findClassById`).
- `…ByKey` — addressed by a natural/business key (`findClassByKey`).
- `…InWorkspace` — **security scope**: the object must belong to the request
  workspace or it reads as missing (`findByIdInWorkspace`). Applied *before*
  authorization checks.
- `…ByWorkspace` — a **plain filter** over the caller's own workspace
  (`listByWorkspace`), not a security boundary.

Two invariants:

1. **One soft-delete verb per port.** The port implies the aggregate, so the
   member is always `softDelete` — never `softDeletePost`, `softDeleteThread`, ….
2. A name is only `find…` when it returns a single nullable object; a boolean
   predicate stays `existsInWorkspace` (`find…` would be misleading).

TASK-39 applied the convention as a bounded, behaviour-preserving rename:

| Port | Before | After |
| --- | --- | --- |
| `IDiscussionRepository` | `softDeletePost` | `softDelete` |
| `IDiscussionRepository` | `updateThreadStatus` | `update` |
| `IProposalRepository` | `findByWorkspace` (paginated list) | `listByWorkspace` |
| `IEdgeRepository` | `findByWorkspace` (unpaginated list) | `listAllByWorkspace` |

`applyDelta` / `applyClassDelta` / `applyScoreDelta` already conformed and were
left unchanged; `softDelete` on node/edge was already canonical.

Verified with:

```bash
grep -rn "softDeletePost\|updateThreadStatus\|findByWorkspace" apps/api/src   # → renamed
```

---

## 7. Implementation Status — MILESTONE-1.5 (Governance) ✅

> Date: 2026-10-15 · Validated with `pnpm turbo run build` (3/3 packages)

### 7.1. Two databases (no architecture changes)

| Level | Database | Schemas/Tables | Role |
| --- | --- | --- | --- |
| Global | `vozlab_router` | `tenants`, `tenant_connections` | Routes and validates the tenant |
| Per tenant | Exclusive physical DB | `auth.*`, `meta.*`, `public.*` (nodes/edges/edit_proposals) | Graph and governance data |

The router client (`createRouterDrizzle`) now imports **only** `router.schema`,
guaranteeing that the routing layer does not know the tenant schemas.

### 7.2. Use cases and endpoints

| Endpoint | Use case | Effect |
| --- | --- | --- |
| `POST /api/v1/nodes` | `CreateNodeUseCase` | Inserts into `public.nodes` + publishes `stream:node_created` (with `reqId`) |
| `POST /api/v1/proposals` | `CreateProposalUseCase` | Inserts `PENDING` proposal |
| `PUT /api/v1/proposals/:id/approve` | `ApproveProposalUseCase` | Applies delta to the node + changes status, **in a `UnitOfWork`** |
| `PUT /api/v1/proposals/:id/reject` | `RejectProposalUseCase` | Only changes the proposal status |
| `GET /health/ready` | `HealthController` | Verifies Router DB + Redis |

### 7.3. Persistence and event adapters

- `DrizzleNodeRepository` and `DrizzleProposalRepository`: real Drizzle queries,
  **scoped by `tid`**; they reuse the `tx` handle of the `UnitOfWork` when it exists.
- `RedisEventPublisher`: `XADD` to `stream:<event_in_lowercase>`
  (`NODE_CREATED` → `stream:node_created`). Publication is post-commit and *best-effort*,
  so a broker failure never reverts already persisted data.

### 7.4. State machine (domain, without external dependencies)

The transition `PENDING → APPROVED_BY_AUTHOR | REJECTED_BY_AUTHOR | AUTO_APPLIED` lives in
the `EditProposal` entity; the use cases do not reimplement the rule.

### 7.5. Detected pending items (outside the scope of MILESTONE-1.5)

- `packages/database/drizzle.config.ts` does not exist → `drizzle-kit generate` (MILESTONE-0.4) is not yet executable.
- Columns added to `public.edit_proposals`: `resolved_by`, `resolved_at` (required by FR-12).
