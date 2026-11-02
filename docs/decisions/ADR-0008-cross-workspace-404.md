# ADR-0008: Cross-workspace access returns 404, never 403

- Status: Accepted
- Date: 2026-10-19

## Context

Physical isolation is per tenant, not per workspace. Inside one tenant, an id-addressed endpoint that only filters by id can read or mutate an object belonging to another workspace. Returning 403 for that case confirms that the object exists, which leaks its existence and lets a caller probe another workspace's ids. The Phase 1R audit found this hole in edges, proposals, discussions and ontology operations.

## Decision

Every id-addressed read or mutation is scoped to the request workspace (`X-Workspace-ID` -> `ctx.workspaceId`). A missing object, a soft-deleted object, and an object belonging to another workspace are indistinguishable: the use case returns the type-appropriate not-found error (`ERR_NODE_NOT_FOUND`, `ERR_EDGE_NOT_FOUND`, `ERR_PROPOSAL_NOT_FOUND`, `ERR_THREAD_NOT_FOUND`, `ERR_POST_NOT_FOUND`, or `ERR_VALIDATION_FAILED` where the target type has no dedicated not-found code).

403 `ERR_AUTHORIZATION_FAILED` is reserved for a caller who is authorized to know the object exists but is not allowed to act on it (for example, a non-author deleting a node, or a non-maintainer resolving a proposal). The workspace check runs before the role/author check.

This rule applies to nodes, edges, proposals, discussion threads and posts, ontology classes and properties, and vote targets. It also applies to the subgraph root and to both endpoints of a new edge.

## Consequences

### Positive

- A caller cannot use status codes to enumerate objects in another workspace.
- The rule is uniform across verticals, so a new endpoint has one isolation pattern to copy.
- It composes with physical tenant isolation without relying on separate credentials per workspace.

### Negative / costs

- A client cannot distinguish "wrong workspace" from "deleted or never existed"; support and debugging must use logs/traces.
- Each adapter needs a workspace predicate on every id lookup, including joins and polymorphic targets.
- A missed scope is silent (a normal-looking 404 or, worse, a mutation), so code review and tests must check it explicitly.

## Links

- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §6.6
- `apps/api/src/application/use_cases/proposalAuthorization.ts`
- `apps/api/src/application/use_cases/CreateEdgeUseCase.ts`
- `apps/api/src/application/use_cases/CloseThreadUseCase.ts`
- `apps/api/src/application/use_cases/CastVoteUseCase.ts`
- `.claude/tasks/TASK-22_cross-workspace-isolation.md`, `TASK-35_proposal-authorization-workspace-scoping.md`
