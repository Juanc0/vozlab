# TASK-05 — Enforce Workspace Membership in `TenantWorkspaceGuard`

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-02, TASK-04 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-05 and `docs/system/system_04_authentication_and_multitenancy.md` §2.2 require that **on
every request** the API verifies the authenticated user holds an active membership
(`auth.workspace_memberships`) in the workspace named by the `X-Workspace-ID` header, inside
the **tenant's physical database**.

Today, `TenantWorkspaceGuard` only:
1. requires the header, validates it as a UUID;
2. reads `req.oidcTenantId` (set by `AuthGuard`);
3. resolves the tenant in the **router** DB (`findTenantByOidcId`);
4. attaches `req.tid` / `req.workspaceId`.

It never checks membership. Any authenticated user of a tenant can therefore operate in any
workspace of that tenant. This task closes that gap.

Key facts you need:
- `AuthGuard` sets `req.user = { userId, authorHash }` (userId comes from the JWT `sub` claim)
  and `req.oidcTenantId`.
- The tenant DB is reached via `ConnectionPoolManager.getDb(tid)` which returns a Drizzle
  client bound to the tenant database.
- `auth.workspace_memberships` (Drizzle export `workspaceMemberships`) columns:
  `id, workspaceId, userId, role ('ADMIN'|'MODERATOR'|'MEMBER'), createdAt`.
- System AI agents authenticate with a bot JWT and set `req.isSystemAgent = true`
  (types: `AGENT_EXTRACTOR`, `AGENT_RELACIONADOR`, `AGENT_CONSOLIDADOR`). They usually have no
  membership row and must be allowed to bypass the membership check.

## 2. Objective
Reject requests where the user is not a member of the header workspace with a **403**, while
keeping the router/tenant resolution behaviour and allowing system agents through.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` is pure (no Drizzle/pg/Fastify). The membership contract is a **port**.
- Physical multi-tenant isolation: every repository method takes `tid`.
- Adapters are wired manually in the Composition Root (`server.ts` + `routes.ts`).
- Errors use `ERROR_CODES` from `@vozlab/shared-types` (here:
  `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` = 403).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | port | `apps/api/src/domain/ports/IMembershipRepository.ts` |
| Create | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleMembershipRepository.ts` |
| Edit | guard | `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |

## 5. Step-by-step instructions
1. Create the port:
   ```ts
   export type WorkspaceRole = 'ADMIN' | 'MODERATOR' | 'MEMBER';
   export interface IMembershipRepository {
     isMember(userId: string, workspaceId: string, tid: string): Promise<boolean>;
     getRole(userId: string, workspaceId: string, tid: string): Promise<WorkspaceRole | null>;
   }
   ```
   (TASK-08 will use `getRole`; implement it now.)
2. Implement `DrizzleMembershipRepository` with the same `client(tid, tx?)` pattern used by the
   other repositories (`return tx ?? (await this.poolManager.getDb(tid))`). Query
   `workspaceMemberships` by `and(eq(workspaceId), eq(userId))` and `limit(1)`.
3. Update `tenantWorkspaceGuard`:
   - extend its `deps` to `{ routerDb: IRouterDatabase; membershipRepo: IMembershipRepository }`;
   - after resolving `tenant` and **before** attaching `req.tid`, do:
     - if `req.isSystemAgent` → skip the membership check;
     - else if `!req.user?.userId` → 401 `ERR_INVALID_TOKEN` (no identity);
     - else `const ok = await membershipRepo.isMember(req.user.userId, workspaceId, tenant.id);`
       and if `!ok` → 403 `ERR_UNAUTHORIZED_WORKSPACE_ACCESS`;
   - keep the existing `req.tid`, `req.workspaceId`, `req.tenantSlug` assignments.
4. In `server.ts`: instantiate `const membershipRepo = new DrizzleMembershipRepository(poolManager);`
   and pass it into `registerRoutes(...)`.
5. In `routes.ts`: add `membershipRepo: IMembershipRepository` to `RouteDependencies`, destructure
   it, and pass it to the guard: `tenantWorkspaceGuard(req, reply, { routerDb, membershipRepo })`.

## 6. Constraints & gotchas
- The membership query runs against the **tenant** DB (via `tid`), not the router DB.
- Do **not** cache membership in this task (a Redis cache is a possible future optimisation).
- Keep the guard's existing error codes/status for the header and tenant-provisioned cases.
- `getRole` must return `null` (not throw) when the user has no row.

## 7. Acceptance criteria
- [ ] New port + Drizzle adapter exist and are wired through `server.ts` and `routes.ts`.
- [ ] A non-member request to a protected route returns `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`.
- [ ] A member request proceeds normally.
- [ ] A system-agent token (`req.isSystemAgent`) bypasses the membership check.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
# Manual (after TASK-17 seeds a tenant+workspace+membership and you can mint a JWT):
#   member    -> 200/201
#   non-member-> 403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS
```

## 9. Definition of done / handoff
- Build passes; the guard rejects non-members and lets members/agents through.
- Mark `TASK-05` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Redis caching of memberships, role/permission matrices beyond membership, and the
  `AUTO_APPLIED` moderator logic (that is TASK-08).
