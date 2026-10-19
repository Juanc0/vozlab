# ADR-0002: Two physical PostgreSQL databases with `tid` routing

- Status: Accepted
- Date: 2026-10-19

## Context

Multi-tenant isolation is a data-sovereignty requirement: an institution's graph must not share a database with another institution's graph. A shared schema with a mandatory `tenant_id` column was not accepted as the isolation boundary. The system therefore needs a small global registry to locate each institution's physical database, and a request-scoped way to open the right connection.

## Decision

There are two database roles, never mixed:

- **Router** (`vozlab_router`): only `tenants` and `tenant_connections`. It maps the OIDC tenant id to an internal tenant UUID and holds that tenant's physical connection config. The init scripts create it, the Drizzle config and seed default to it, and `.env.example` points `ROUTER_DB_NAME` at it.
- **Tenant DB** (one per institution): `auth`, `meta`, `public` and `social` schemas, including nodes, edges, proposals, discussions and the ontology.

The JWT `tid` claim is the OIDC tenant id. `TenantWorkspaceGuard` resolves it through `tenants.oidc_tenant_id` and verifies provisioning; the resulting internal tenant UUID is carried as `req.tid`. `ConnectionPoolManager` reads `tenant_connections`, caches one pool per `tid` (30-minute TTL) and returns the tenant Drizzle client. Every repository method takes `tid`, and `UnitOfWork.runInTransaction(tid, cb)` passes the transaction handle to repositories. No query joins router and tenant tables.

## Consequences

### Positive

- Cross-tenant reads are physically impossible through the normal request path: the connection is chosen before any repository runs.
- Tenant data can be backed up, migrated or moved independently.
- The router stays tiny, so its schema and availability surface are small.
- Pool reuse avoids opening a connection per request while idle tenants release resources.

### Negative / costs

- The router is a shared dependency; if it is unreachable, requests cannot resolve a tenant (mapped to 503, not 403).
- Every tenant database needs its own migration run; schema drift between tenants is an operational risk.
- `tenant_connections` stores host/port/database/user/password. Credential encryption at rest is not implemented in this repository; the schema comment describes it as a production requirement.
- Cross-tenant analytics require a separate, explicitly authorized path, not a join.

## Links

- `packages/database/src/schema/router.schema.ts`
- `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts`
- `apps/api/src/infrastructure/persistence/ConnectionPoolManager.ts`
- `apps/api/src/domain/ports/IRouterDatabase.ts`
- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §7.1
- `docs/archive/spec-v1/system/system_04_authentication_and_multitenancy.md` §1
