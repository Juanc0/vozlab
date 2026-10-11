---
title: "Especificación de Módulo: Backend Fastify, Arquitectura Hexagonal y Guía de Boilerplate"
version: 1.0.0
status: APPROVED
target_component: Backend API (Node.js / TypeScript)
owner: Backend & Architecture Team (VozLab)
---

# 02. BACKEND FASTIFY, ARQUITECTURA HEXAGONAL Y GUÍA DE BOILERPLATE

## 1. Organización del Código por Capas (Layer-First / Hexagonal)

El backend de VozLab (`apps/api/`) se organiza en capas concéntricas aisladas. La capa de **Dominio** no tiene conocimiento de HTTP, Fastify, Drizzle ORM ni bases de datos.


```

apps/api/src/
├── domain/                         <-- Entidades puras, Value Objects y Errores
│   ├── entities/                   <-- Node.ts, EditProposal.ts, OntologyClass.ts
│   ├── value_objects/              <-- AuthorHash.ts, SystemKey.ts, VoteValue.ts
│   └── ports/                      <-- Interfaces TypeScript puras (Repositorios y Servicios)
│       ├── INodeRepository.ts
│       ├── IProposalRepository.ts
│       └── IEventPublisher.ts
│
├── application/                    <-- Casos de Uso (Lógica de Negocio agnóstica)
│   ├── use_cases/                  <-- CreateNodeUseCase.ts, ApproveProposalUseCase.ts
│   └── dtos/                       <-- Objetos de transferencia de datos de entrada/salida
│
├── infrastructure/                 <-- Adaptadores concretos de infraestructura
│   ├── http/                       <-- Servidor Fastify, Plugins, Rutas y Controladores
│   │   ├── controllers/            <-- Manejadores HTTP (NodeController.ts)
│   │   ├── middlewares/            <-- AuthGuard.ts, TenantWorkspaceGuard.ts
│   │   └── routes/                 <-- Enrutadores Fastify por dominio (/nodes, /proposals)
│   ├── persistence/                <-- Drizzle ORM (PostgreSQL) y Apache AGE (Cypher)
│   │   ├── repositories/           <-- DrizzleNodeRepository.ts, AgeGraphRepository.ts
│   │   └── unit_of_work.ts         <-- Implementación de transacciones atómicas
│   └── events/                     <-- Adaptador de Redis Streams (RedisEventPublisher.ts)
│
└── shared/                         <-- Utilidades transversales
├── config/                     <-- Validación estricta de entorno con Zod (env.ts)
└── logger/                     <-- Pino Logger estructurado con Correlation ID

```

---

## 2. Inicialización del Servidor y Composición Manual (Composition Root)

Para evitar la complejidad y la sobrecarga de contenedores IoC pesados, las dependencias se inyectan de forma explícita mediante el patrón **Composition Root** al arrancar Fastify:

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

  // 1. Instanciación de Adaptadores (Infraestructura)
  const nodeRepo = new DrizzleNodeRepository();
  const eventPublisher = new RedisEventPublisher();

  // 2. Inyección de Dependencias en Casos de Uso (Aplicación)
  const createNodeUseCase = new CreateNodeUseCase(nodeRepo, eventPublisher);

  // 3. Registro de Rutas Inyectadas
  await registerRoutes(app, { createNodeUseCase });

  return app;
}

```

---

## 3. Middlewares de Seguridad y Control Multi-Tenant

### 3.1. TenantWorkspaceGuard (`TenantWorkspaceGuard.ts`)

Valida de forma *stateless* que el usuario autenticado posea una membresía activa sobre el Workspace indicado en el header `X-Workspace-ID`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantWorkspaceGuard(req: FastifyRequest, reply: FastifyReply) {
  const workspaceId = req.headers['x-workspace-id'] as string;
  const user = req.user; // Inyectado por AuthGuard (JWT Cookie)

  if (!workspaceId) {
    return reply.status(400).send({
      status: 'error',
      code: 'ERR_MISSING_WORKSPACE_HEADER',
      message: 'Header X-Workspace-ID is required for this request',
    });
  }

  // Validación de membresía en Base de Datos (con caché Redis opcional)
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

---

## 4. Implementación de Casos de Uso y Transacciones (`UnitOfWork`)

Ejemplo de un Caso de Uso protegido que ejecuta mutaciones atómicas en múltiples tablas y emite un evento asíncrono:

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

    // Transacción atómica multitabla
    await this.uow.runInTransaction(async (tx) => {
      // 1. Aplica el delta al nodo principal
      await this.nodeRepo.applyDelta(proposal.targetId, proposal.proposedChanges, workspaceId, tx);
      
      // 2. Actualiza el estado de la propuesta
      await this.proposalRepo.updateStatus(proposalId, 'APPROVED_BY_AUTHOR', authorHash, tx);
    });

    // 3. Emite evento asíncrono a Redis Streams (fuera de la transacción DB)
    await this.eventPublisher.publish('proposal:approved', {
      proposalId,
      targetId: proposal.targetId,
      workspaceId,
    });
  }
}

```

---

## 5. Validación Estricta de Bordes con Zod

Todos los parámetros de entrada HTTP (Body, Query Params, Headers) se validan mediante esquemas Zod integrados directamente en Fastify:

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

