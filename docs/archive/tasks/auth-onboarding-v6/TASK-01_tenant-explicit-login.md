# TASK-01 — Tenant explícito en login + selector/switch

> Batch: v6.1 · Depends on: none · Size: L · Self-contained: yes.

## 1. Context
CompleteOidcLoginUseCase still resolves tenant from IdP claims (hd/tid/org). v5 requires explicit tenant resolution from global_user_tenants, with auto-select if one, selector if many.

## 2. Objective
Integrate ResolveTenantsUseCase and SelectTenantUseCase into the auth flow: after OIDC, query linked tenants; if 0 → error (no access, redirect to invitation); if 1 → auto-select (current behavior); if N → return requiresTenantSelection + list. Add endpoints select-tenant and switch-tenant. Issue new JWT on selection/switch without re-auth.

## 3. Conventions
- pnpm, NodeNext .js imports. No IoC.
- Tenant in JWT (globalUserId, tenantId, authorHash).

## 4. Files to touch
- apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts (use findTenantsByGlobalUser; if >1 return selection required)
- apps/api/src/application/use_cases/CompleteOidcLoginResult (add requiresTenantSelection, tenants list, make refreshToken optional)
- apps/api/src/infrastructure/http/controllers/AuthController.ts (handle selection response; add select-tenant, switch-tenant endpoints)
- apps/api/src/infrastructure/http/routes.ts (wire routes)
- server.ts (wire use cases)
- tests (update CompleteOidcLogin tests for new result shape)
- web: tenant selector page + API client

## 5. Acceptance criteria
- Single tenant: auto-select, JWT issued, no selector.
- Multi tenant: returns list, no JWT; select-tenant issues JWT.
- switch-tenant issues new JWT without re-auth.
- Zero tenant: error + redirect hint.
- build/type-check/test green.