# Conventions

Rules that keep the backend consistent. They describe `apps/api` as it exists;
when a rule and the code disagree, fix one of them in the same change.

## 1. Layers and dependency direction

| Layer | Location | May depend on | Must not contain |
| --- | --- | --- | --- |
| Domain | `src/domain/` | Domain only (entities, value objects, ports, typed errors) | Fastify, Drizzle, `pg`, Redis, HTTP status codes |
| Application | `src/application/use_cases/` | Domain ports/entities, shared DTO types | HTTP request/reply objects, SQL |
| Infrastructure | `src/infrastructure/` | Domain, application, drivers | Business rules that belong in a use case |
| Composition root | `src/infrastructure/http/server.ts` | Every concrete adapter and use case | Business logic |

- `domain/` is pure TypeScript. If it needs a database type, the port exposes
  an opaque handle.
- Use cases orchestrate ports; they do not know whether storage is Drizzle,
  memory or a remote service. Controllers parse/validate with Zod, call one use
  case, project a stable DTO and map errors; they never query the database.
- Dependencies are wired manually in `buildServer()` and passed to
  `registerRoutes()`. There is no IoC container and no service locator. Keep a
  change within one component/layer where possible.

## 2. NodeNext imports

Every **relative** import in a `.ts` file ends in `.js`, even though the source
file is `.ts` — for example
`import { CreateNodeUseCase } from './CreateNodeUseCase.js'`. This applies to
source, tests and scripts. Workspace imports (`@vozlab/shared-types`,
`@vozlab/database`) have no extension. `build` is `tsc --noEmit`; no JavaScript
is emitted, so `start` must use `tsx`.

## 3. Tenant and workspace scoping

- `tid` is the internal tenant UUID. **Every** repository method takes it as an
  argument; adapters resolve the tenant pool from it.
- Multi-table writes go through
  `UnitOfWork.runInTransaction(tid, async (tx) => { ... })`. Pass the same
  `tx` to every repository call in the callback. A repository called without
  `tx` uses its own pooled connection and is outside the boundary.
- `workspaceId` comes from the `X-Workspace-ID` header via the guards, never
  from the body or a path. An object addressed by id must be scoped to that
  workspace before it is read or mutated (`findByIdInWorkspace`, or an explicit
  `entity.workspaceId !== workspaceId` check).
- **A resource in another workspace is reported as 404 (`ERR_*_NOT_FOUND`),
  never 403.** A 403 would confirm that the object exists elsewhere. 403 is
  reserved for a real authorization failure: the caller is not a member of the
  declared workspace (`ERR_UNAUTHORIZED_WORKSPACE_ACCESS`), is not the
  author/maintainer (`ERR_AUTHORIZATION_FAILED`), or lacks a moderator/admin
  role. See [ADR-0008](decisions/ADR-0008-cross-workspace-404.md).
- Protected resource guards run in the fixed order
  `authGuard → tenantGuard → tenantWorkspaceGuard → rateLimit`. Public auth
  routes (`/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/event-join`)
  run only the per-IP rate limiter; `/auth/logout` runs `authGuard`, and
  `/auth/me` runs `authGuard → tenantGuard` without a workspace header.
  Do not register protected routes without the full chain; health routes are
  public by design.

## 4. Timestamp ownership

| Concern | Single writer | Rule |
| --- | --- | --- |
| `created_at` | Domain entity | Constructor/default sets it; the adapter persists it verbatim. |
| `updated_at` | Domain method | The method that mutates the entity bumps it; the adapter persists `entity.updatedAt` and never calls `new Date()` in an `UPDATE`. |
| `deleted_at` | Persistence adapter | Only `softDelete` stamps it. Use cases never touch it. |
| Reads | Adapter | Filters `deleted_at IS NULL`; the use case applies workspace/authorization checks. |

`DrizzleNodeRepository.applyDelta` loads the row, rebuilds the entity, routes
the delta through `updateAttributes` (bumping `updatedAt`) and persists it —
one `UPDATE`, still domain-owned. `applyDelta` filters `deleted_at`. Fresh posts
omit `deletedAt`, so the column defaults to `NULL`. See
[ADR-0011](decisions/ADR-0011-timestamp-ownership.md).

## 5. Port vocabulary

| Verb | Meaning | Return |
| --- | --- | --- |
| `find…` | Load one object; absent → `null` | `T \| null` |
| `list…` | Load a collection | `T[]` or `{ items, nextCursor }` |
| `save` | Insert a new entity | `void` |
| `update` | Persist a mutated entity | `void` |
| `softDelete` | Stamp `deleted_at` on the aggregate | `void` |
| `apply…Delta` | Merge an approved proposal delta | `void` |

Suffixes: `…ById` (primary key), `…ByKey` (natural key), `…InWorkspace`
(**security scope**: the object must belong to the request workspace or it
reads as missing), `…ByWorkspace` (plain filter, not a security boundary).
One soft-delete verb per port (`softDelete`, never `softDeletePost`). A
boolean predicate is `existsInWorkspace`, not `find…`. See
[ADR-0010](decisions/ADR-0010-port-naming-vocabulary.md).

## 6. Errors

- The domain throws `DomainError` with a stable `DomainErrorCode`, no HTTP
  status and no Fastify import. Infrastructure failures throw
  `InfrastructureError` with a shared `ErrorCode`.
- Controllers call `sendError(reply, code)` / `mapDomainError(error)`. Mapping
  is by type and `error.code`, never by parsing a message. Any unknown or
  non-domain error becomes `500 ERR_INTERNAL_SERVER_ERROR`.
- Only codes in `packages/shared-types/src/errors/http-errors.ts` may be sent.
- The envelope is `{ "code": "...", "message": "..." }`; validation failures
  add `issues` from Zod. The full catalogue is in [Errors](errors.md).

## 7. Pagination

- Cursor pagination only — never `OFFSET`. Shared helpers live in
  `infrastructure/persistence/keyset.ts`: base64(`"<createdAt ISO>|<id>"`),
  tuple comparison matching `ORDER BY`, `LIMIT limit + 1` to detect a next
  page. Cursors are opaque; a malformed one is `ERR_VALIDATION_FAILED` (422),
  not a silent first page.
- Each resource returns its own collection key plus `nextCursor`, for example
  `{ "nodes": [...], "nextCursor": null }` — not a generic `items` wrapper.
- `limit` is clamped by Zod (1–100); `nextCursor` is `null` on the last page.

## 8. Events

- Publish **after** the transaction commits, best-effort. A broker failure is
  logged, never rolled back into persisted data. `RedisEventPublisher.publish`
  never throws.
- Event names are upper snake case; the stream key is
  `stream:<lowercase event>` (`NODE_CREATED` → `stream:node_created`). Payloads
  are flat strings; the adapter JSON-encodes nested values.
- The shared Python worker runtime (`packages/worker-shared`, ADR-0021) has
  consumer groups, `XAUTOCLAIM`, bounded attempts and a dead-letter stream. No
  worker handler is running yet, so `NODE_CREATED` is still unconsumed and
  nothing computes `nodes.embedding`.

## 9. Type safety

- New public contracts must avoid `any`. Prefer `unknown` and narrow at the
  boundary, or use a precise generic.
- `DbTransaction` is deliberately opaque (`export type DbTransaction =
  unknown`). Adapters narrow it once to their concrete Drizzle type. The
  compiler cannot prove the handle belongs to the same tenant/database as
  `tid`; a wrong handle fails at runtime. Do not fix this by widening to `any`.
- Residual `any` in attribute maps and legacy ports is known debt: `pnpm lint`
  currently fails with pre-existing `no-explicit-any` errors. Do not add more;
  `pnpm turbo run build` is the green gate.

## 10. Python workers

- Python code targets **3.12** and is managed with **uv** from the repo-root
  `pyproject.toml` / `uv.lock`. Each worker is a package under `apps/worker-*`;
  shared runtime code lives in `packages/worker-shared` (import
  `vozlab_worker`). Do not duplicate config, retry or consumer-group code.
- Format and lint with `uv run ruff format` / `uv run ruff check`; test with
  `uv run pytest`. Python is not yet in the Turbo task graph or CI.
- Workers call the API with an agent JWT and `X-Workspace-ID`; they never open
  a tenant PostgreSQL connection or write graph tables directly. The embedder
  writes vectors through the agent-only `PUT /api/v1/nodes/:id/embedding`
  route. Read-only vector queries are the future Relator exception and must
  still enforce `workspace_id`, `deleted_at IS NULL` and a status allow-list.
- Stream handlers acknowledge only after success, are idempotent, and carry the
  event's `reqId` as the `x-correlation-id`. Retryable failures stay in the PEL;
  permanent failures go to `<stream>:dead`.
- JSON logs go to stdout with the same correlation id; do not log tokens,
  connection strings or raw PII.

## 11. Related decisions

[ADR-0007 — Rate limiting](decisions/ADR-0007-per-actor-rate-limiting.md) ·
[ADR-0008 — Cross-workspace 404](decisions/ADR-0008-cross-workspace-404.md) ·
[ADR-0010 — Port naming](decisions/ADR-0010-port-naming-vocabulary.md) ·
[ADR-0011 — Timestamp ownership](decisions/ADR-0011-timestamp-ownership.md).

Related: [Domain model](domain-model.md) · [API reference](api-reference.md) ·
[Errors](errors.md).
