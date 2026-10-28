# TASK-02 — Explicit tenant selection + tenant selector

> **Batch:** Auth v5.2 · **Depends on:** TASK-01 · **Size:** L
> **Self-contained:** yes (assumes TASK-01 done; can be read standalone).

## 1. Context
Tenant is currently resolved from IdP claims (hd/tid/org) and embedded in JWT. For multi-tenant users and external collaborators, tenant must be selected explicitly.

## 2. Objective
Make tenant selection explicit: after OIDC authentication, resolve the list of linked tenants from router DB; auto-select if one, show selector if multiple, deny if zero. Embed selected tenant in JWT.

## 3. Conventions
- pnpm only, NodeNext `.js` imports.
- Tenant from JWT, not header (for now; header override optional for admin).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts` |
| Create | `apps/api/src/application/use_cases/ResolveTenantsUseCase.ts` |
| Create | `apps/api/src/application/use_cases/SelectTenantUseCase.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/AuthController.ts` |
| Edit | `apps/web/src/routes/(auth)/...` (tenant selector UI) |
| Edit | `apps/web/src/lib/api/auth.ts` |

## 5. Step-by-step
1. Create `ResolveTenantsUseCase`: input globalUserId → output list of linked tenants (from global_user_tenants JOIN tenants).
2. Create `SelectTenantUseCase`: input (globalUserId, tenantId) → verify link exists → upsert tenant user → issue JWT with tenantId.
3. Modify `CompleteOidcLoginUseCase`: after identity resolution, if single tenant → auto-select and issue JWT; if multiple → return a "tenant selection required" response (with list); if zero → error (no tenant access, redirect to invitation).
4. Add endpoint `POST /api/v1/auth/select-tenant` for the selector UI.
5. Web: after OIDC callback, if multiple tenants, show selector page; call select-tenant; store access token.
6. Add `switchTenant` capability: re-issue JWT without re-auth.

## 6. Acceptance criteria
- Single-tenant user: auto-select, no selector shown.
- Multi-tenant user: selector shown, selection works.
- Zero-tenant user: denied with clear message.
- `pnpm turbo run build type-check test` passes.