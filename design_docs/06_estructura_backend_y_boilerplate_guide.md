
# ESPECIFICACIÓN DE ESTRUCTURA Y GUÍA DE BOILERPLATE DEL BACKEND (VOZLAB)

## 1. Organización del Código por Capas (Layer-First Layout)

El proyecto adopta un enfoque **Layer-First** que aplica estrictamente los principios de la **Arquitectura Hexagonal (Puertos y Adaptadores)**. La capa de Dominio permanece aislada de la infraestructura HTTP y de la persistencia de datos.


```

src/
├── domain/                         <-- CAPA DE DOMINIO (Entidades puras, Value Objects, Errores de dominio)
│   ├── entities/                   <-- Node, Edge, EditProposal, User, Workspace, OntologyClass
│   ├── value_objects/              <-- AuthorHash, SystemKey, VoteValue
│   ├── errors/                     <-- DomainError, EntityNotFoundError, UnauthorizedActionError
│   └── ports/                      <-- PUERTOS (Interfaces TypeScript puras)
│       ├── repositories/           <-- INodeRepository, IGraphRepository, IUserRepository
│       └── services/               <-- IEventPublisher, IOidcProvider, IUnitOfWork
│
├── application/                    <-- CAPA DE APLICACIÓN (Casos de Uso / DTOs)
│   ├── use_cases/                  <-- CreateNodeUseCase, ApproveEditProposalUseCase, VotePostUseCase
│   └── dtos/                       <-- Objetos de transferencia de datos de entrada/salida
│
├── infrastructure/                 <-- CAPA DE INFRAESTRUCTURA (Adaptadores concretos)
│   ├── http/                       <-- Servidor Fastify, rutas, controladores, middlewares
│   │   ├── controllers/            <-- Manejo de peticiones HTTP/REST
│   │   ├── middlewares/            <-- Auth (JWT/OIDC), TenantContext, ErrorHandler
│   │   └── routes/                 <-- Definición de endpoints Fastify
│   ├── persistence/                <-- ADAPTADORES DE PERSISTENCIA
│   │   ├── sql/                    <-- Adaptadores Drizzle ORM (Relacional / Documental)
│   │   │   ├── schema/             <-- Esquemas Drizzle (auth, meta, public, social)
│   │   │   ├── repositories/       <-- DrizzleNodeRepository, DrizzleUserRepository
│   │   │   └── unit_of_work.ts     <-- Implementación de IUnitOfWork para Drizzle
│   │   └── cypher/                 <-- Adaptadores Apache AGE (Grafo LPG)
│   │       ├── client/             <-- Ejecutor de consultas Cypher raw vía postgres.js
│   │       └── repositories/       <-- AgeGraphRepository (Navegación y saltos en el grafo)
│   ├── events/                     <-- Redis Streams (EventPublisher, EventSubscriber)
│   └── identity/                   <-- Adaptadores OIDC (Azure AD / Google OAuth2)
│
└── shared/                         <-- UTILIDADES COMPARTIDAS
├── config/                     <-- Validación de variables de entorno (Zod)
└── logger/                     <-- Pino Logger (Logger asíncrono estructurado)

```

---

## 2. Configuración, Logging y Manejo Global de Errores

### 2.1. Validación de Entorno Fail-Fast (Zod)
Al arrancar la aplicación, el archivo `shared/config/env.ts` valida todas las variables de entorno requeridas (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `LOG_LEVEL`) contra un esquema **Zod**. Si falta alguna variable o su formato es inválido, el proceso se detiene inmediatamente en el segundo cero.

### 2.2. Logging Centralizado y Trazabilidad (Pino)
* **Formato Estructurado:** Salida en JSON optimizado mediante **Pino**.
* **Request Correlation ID:** Cada petición asigna o propaga un `reqId` utilizando `AsyncLocalStorage` de Node.js. Toda traza de log generada en cualquier capa incluye automáticamente el `reqId`, `tenantId` y `workspaceId`.
* **Diferenciación por Entorno:**
  * **DEV:** Log en modo `debug` con formateo para consola (`pino-pretty`).
  * **PROD:** Log en modo `info` enviado a `stdout`. Los errores (`error`) registran el *stack trace* completo en los logs del servidor sin exponerlo al cliente HTTP.

### 2.3. i18n y Mapeo Global de Errores HTTP
* **Backend Neutro (Códigos Estándar):** El backend no traduce cadenas de texto estáticas. Ante cualquier error, responde con un formato JSON unificado que incluye un código de error de dominio y sus parámetros de contexto:
    ```json
    {
        "status": "error",
        "code": "ERR_ENTITY_NOT_FOUND",
        "message": "Entity with requested ID was not found in active workspace",
        "params": { "nodeId": "123e4567-e89b-12d3-a456-426614174000" },
        "timestamp": "2026-10-09T22:30:00Z"
    }

    ```

* **Traducción en Frontend (PWA):** La PWA SvelteKit captura el código `ERR_*` y traduce el mensaje visualmente utilizando el idioma preferido por el navegador del usuario.

---

## 3. Inyección de Dependencias y Transacciones SQL

### 3.1. Inyección Manual por Composición (Manual Wiring)

Para garantizar código transparente, sin decoradores ni magias de ejecución, las dependencias se inyectan manualmente mediante el patrón **Factory / Composition Root** en la inicialización del servidor:

* Los Casos de Uso dependen exclusivamente de las interfaces del Dominio (`INodeRepository`, `IEventPublisher`).
* No se utilizan contenedores IoC pesados ni decoradores globales.

### 3.2. Transacciones Atómicas Multitabla (`UnitOfWork`)

Las operaciones que involucran mutaciones en múltiples tablas de la base de datos se ejecutan dentro del patrón `IUnitOfWork`:

```typescript
await this.unitOfWork.runInTransaction(async (tx) => {
  await this.proposalRepo.approve(proposalId, tx);
  await this.nodeRepo.update(nodeId, newAttributes, tx);
  await this.logRepo.record(actionLog, tx);
});

```

Si ocurre un fallo en cualquiera de las llamadas, el motor de PostgreSQL realiza un `ROLLBACK` automático de toda la transacción.

---

## 4. Estrategia de Pruebas (Vitest)

Las pruebas están organizadas en una carpeta centralizada `/tests`:

```
tests/
├── unit/                       <-- Pruebas Unitarias (Súper rápidas, en memoria)
│   ├── domain/                 <-- Reglas de negocio y Value Objects
│   └── use_cases/              <-- Lógica de Casos de Uso utilizando In-Memory Repositories
├── integration/                <-- Pruebas de Integración
│   ├── persistence/            <-- Verificación de SQL/Drizzle y Cypher/Apache AGE en Docker
│   └── http/                   <-- Endpoints HTTP de Fastify
└── mocks/                      <-- Repositorios falsos en RAM (InMemoryNodeRepository, etc.)

```

### 4.1. Repositorios en Memoria (*In-Memory Repositories*)

Para probar la lógica de los Casos de Uso sin depender de una base de datos real ni de mocks frágiles, la carpeta `tests/mocks/` implementa las interfaces de los puertos guardando las entidades en arreglos nativos de JavaScript (`Array[]`). Permite ejecutar la suite completa de pruebas unitarias en milisegundos.

---

## 5. Oportunidades de Mejora Futuras

1. **Internacionalización Ontológica Dinámica (`display_names`):**
Actualmente el esquema `meta.*` soporta campos `display_names JSONB`. Para evitar exigir al usuario creador que ingrese traducciones en múltiples idiomas al momento de proponer un nodo o clase ontológica


