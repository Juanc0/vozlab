# Revisión de arquitectura: autenticación y onboarding (tenant / workspace)

Comité: arquitectura + seguridad + producto + devops + frontend + base de datos.
Fecha: 2026-10-29 (v6 — estado REAL verificado sobre código, no aspiracional).
Contexto: VozLab multi-tenant (router DB `vozlab_router` + una DB por tenant), Fastify API + SvelteKit 5 PWA, OIDC (Zitadel local en `:8081` vía identity-lab, actualmente CAÍDO en dev), event join anónimo, workspaces con admin tenant/workspace, join requests, invitaciones email-bound (solo URL, sin servicio de email), códigos efímeros, invitaciones globales cross-IdP, roles múltiples por workspace.

Estado de referencia: `pnpm turbo run build type-check test` VERDE (242 tests API, 515 tests web, 41+60 archivos de test). El build pasa, pero **verde no significa completo**: varias tareas reportadas como "hecha" están a medias (endpoint faltante, uso case no cableado, resolución que devuelve null, auditoría en memoria, rate limit en una sola ruta, seed incompleto, sin HTTPS real).

---

## 0. Resumen ejecutivo (estado real, verificado sobre código)

### Lo que SÍ está hecho y funciona
- DB: `global_users`, `global_identity_tenants`, `global_invitations`, `global_identity_events` (router); `workspaces` (+`kind`, `auto_approve_join_code`, `join_code`), `users` (+`handle`, `is_anonymous`, `provider`), `workspace_memberships` (PK única por `(workspace, user, role)`), `workspace_join_codes`, `invitations`, `workspace_join_requests`, `membership_events` (append-only), `external_identities`.
- Migraciones: router 0000–0009, tenant 0000–0016. `db:migrate:router` / `db:migrate:tenant`.
- Ports/adapters: `IGlobalUserRepository`, `IGlobalInvitationRepository`, `IWorkspaceJoinCodeRepository`, `IAuditLog` (puerto), `DrizzleAuditLog` (ahora **en memoria**, NO persistido), `DrizzleWorkspaceJoinCodeRepository`, `RouterDatabaseClient` (implementa `IRouterDatabase`, `IGlobalUserRepository`, `IGlobalInvitationRepository`, `ITenantIdentityProviderRepository`, `IEventCodeRepository`).
- Use cases atómicos ya creados: `ResolveTenantsUseCase`, `SelectTenantUseCase`, `ManageRoleAtomicUseCase`, `RedeemInvitationAtomicUseCase`, `CreateGlobalInvitationUseCase`, `RedeemGlobalInvitationUseCase`, `CreateWorkspaceJoinCodeUseCase`, `RotateJoinCodeUseCase`, `CleanupExpiredInvitationsUseCase`.
- `CompleteOidcLoginUseCase`: upserta `global_users`, redime invitación GLOBAL antes de resolver tenant, escribe el link `global_identity_tenants` en todo login institucional, resuelve tenants linked, `requiresTenantSelection`, `linkedTenants`, `globalUserId`, redención de invitación tenant-local, emite refresh token (`issueSession` compartido por ambos paths).
- Endpoints auth: `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/event-join`, `/auth/select-tenant`, `/auth/resolve-tenants`, `/auth/switch-tenant` (P0-1 cerrado 2026-10-28, commit 22c5481).
- Endpoints admin: `/admin/workspaces` (GET/POST con rate limit `admin-create-workspace`), `/invitations/global` (create; redención vía callback OIDC), `/workspaces/:id/join-codes` (POST/GET/DELETE; **sin PUT/update**), `/admin/users`, `/admin/cleanup` (invitaciones expiradas OK; guests = 0 placeholder).
- Miembros: list, add (handle OK; globalUserId devuelve null), change role, assign/remove role, suspend, reactivate, remove.
- Join requests: list, approve, reject, request access, list mine, discover.
- Guards: `authGuard → tenantWorkspaceGuard/workspaceAdminGuard → rateLimit`; `tenantAdminGuard`, `workspaceAdminGuard` (unión de roles); guard GUEST en RequestWorkspaceAccess; kind EVENT en JoinEvent; CreateWorkspace rechaza anonymous/GUEST.
- Web: estado global (session/workspace/shell/panels), route groups `(auth)`/`(app)`, Cytoscape canvas, governance UI, offline shell, E2E (Playwright, 20+ specs), admin UI (códigos, invitación global URL/QR, roles multi, kind badge, selector tenant, Miembros consolidados, i18n es/en). Direct add envía `handle` (P0-3).
- Seed: `db:seed:dev` crea tenant admin, workspace `general` (PUBLIC), `Evento Demo` (EVENT, autoApprove), código efímero evento. **Faltan:** workspaces PUBLIC/PRIVATE de ejemplo, invitaciones de ejemplo, roles múltiples demo.
- Devops: docker-compose Postgres 18 + Redis 7 + Ollama; perfil `idp` (Zitadel `:8081`); perfil `observability`; perfil `app` (API+web Dockerfiles, no verificado build contenedor). API/web corren como procesos host. Security headers: nosniff, frame-options DENY, referrer no-referrer, HSTS, CSP `default-src 'self'`. **Sin TLS/HTTPS real (HSTS es solo header).**
- CI: `.github/workflows/ci.yml` (TS gate, Python gate, worker image builds). Workers Python (embedder, relacionador, extractor); consolidador pendiente.

### Brechas reales (lo que NO está hecho, a pesar de reportarse)
| # | Brecha | Tarea | Impacto |
|---|--------|-------|---------|
| B1 | ~~`switch-tenant` endpoint ausente~~ — **CERRADO 2026-10-28** (commit 22c5481): `POST /api/v1/auth/switch-tenant` + método en `AuthController` + rate limit `auth-switch-tenant` + 3 tests. | v6/TASK-01, v5/TASK-02 | ~~P0~~ ✅ |
| B2 | ~~`RedeemGlobalInvitationUseCase` no cableado~~ — **CERRADO 2026-10-28**: redención global en `CompleteOidcLogin` ANTES de la resolución de tenant (`isGlobalToken`), link `global_identity_tenants` en redención Y en todo login institucional (hallazgo: el link solo lo escribía el script de reconciliación), wiring en `server.ts`, 16 tests (8 redeem + 8 login). No requiere endpoint redeem dedicado: la redención necesita identidad IdP por el bind de email. | v6/TASK-06, v5/TASK-06 | ~~P0~~ ✅ |
| B3 | ~~`globalUserId` en `AddWorkspaceMemberUseCase` devuelve null~~ — **CERRADO 2026-10-28** (commit 85ceb64): `findGlobalTenantLink` en puerto+adapter, `routerDb` inyectado, web envía `handle`. | v6/TASK-03, v5/TASK-07 | ~~P0~~ ✅ |
| B4 | **`IAuditLog` solo en memoria** (`DrizzleAuditLog` es `InMemoryAuditLog`). `membership_events` se escribe por `membershipAdminRepo.recordEvent` en algunos use cases, pero invitaciones/códigos/join-requests/workspaces no dejan rastro persistente y el puerto genérico no está implementado. | v6/TASK-07, v5/TASK-08 | P0 — auditoría append-only |
| B5 | **Rate limit dedicado solo en `create-workspace`**. Invitaciones, códigos, join requests, workspaces, cleanup sin rate limit por actor. | v6/TASK-07 | P0 — fuerza bruta admin |
| B6 | **Join codes sin Update** (solo create/list/revoke). | v6/TASK-04 | P1 |
| B7 | **Cleanup guests inactivos = 0** (placeholder). | v6/TASK-09 | P1 |
| B8 | ~~Web direct add envía `email`~~ — **CERRADO 2026-10-28** (commit 85ceb64): `addMember` envía `handle`, i18n es/en. | v6/TASK-03, v11 | ~~P1~~ ✅ |
| B9 | **Social logins no verificados** en Zitadel (doc existe, infra no probada). | v6/TASK-09, v5/TASK-09 | P1 |
| B10 | **Seed incompleto**: sin PUBLIC/PRIVATE ejemplo, sin invitaciones ejemplo, sin roles múltiples demo. | v6/TASK-12 | P1 |
| B11 | **HTTPS/reverse proxy pendiente** (solo headers). | v6/TASK-12 | P1 — producción |
| B12 | **Atomización parcial**: `CompleteOidcLogin` y otros siguen monolíticos; los use cases atómicos existen pero no todos están cableados en controladores. | v6/TASK-08, v5/TASK-08 | P2 |

---

## 1. Inventario de flujos (emisor → propósito → estado real)

| # | Flujo | Emisor | Credencial | Resultado | Estado real |
|---|-------|--------|------------|-----------|-------------|
| A | OIDC login + tenant explícito | Humano | Código OIDC + state | Sesión + usuario + tenant en JWT | Hecho (auto-select 1; selector N; switch-tenant OK; login escribe link `global_identity_tenants`) |
| B | Event join anónimo | Asistente | Código de evento global | Usuario anónimo + GUEST en WORKSPACE EVENT | Hecho (kind EVENT validado) |
| C | Descubrimiento público | Autenticado | Ninguna | Solicitud PENDING | Hecho |
| D | Join request por código | Autenticado | Código efímero | PENDING o ACTIVE (autoApprove) | Hecho |
| E | Invitación tenant email-bound | Admin WS | Token URL/QR | Sesión + membresía rol | Hecho (same-IdP) |
| F | Invitación global cross-IdP | Admin tenant | Token URL/QR | Vinculación global + membresía | Hecho (create → callback OIDC redime antes de resolver tenant → link + membresía + sesión) |
| G | Alta directa por admin | Admin WS | handle / identidad global | Membresía ACTIVE | Hecho (handle y globalUserId resueltos vía `findGlobalTenantLink`) |
| H | Aprobación join request | Admin WS | — | PENDING → ACTIVE | Hecho |
| I | Creación de workspace | Admin tenant/WS | — | Workspace + creador ADMIN | Hecho (kind + autoApprove) |

---

## 2. Estado por capa (veraz)

### 2.1 Base de datos
- Router: schema + migraciones 0000–0009 OK. `global_invitations` con redención operativa (vía callback OIDC). `global_identity_tenants` ahora se escribe en cada login institucional y en cada redención global (`linkGlobalTenant`, upsert idempotente) — antes solo lo creaba el script de reconciliación. `global_identity_events` existe (audit cross-tenant, sin uso).
- Tenant: schema + migraciones 0000–0016 OK. `membership_events` existe (append-only) y `membershipAdminRepo.recordEvent` ya escribe ahí para miembros. `workspace_join_codes` completo (create/list/revoke/increment/findByCodeHash; **sin update**).
- Seed: solo `general` + `Evento Demo` + código efímero.

### 2.2 API
- Auth: login/callback/refresh/logout/me/select-tenant/resolve-tenants/event-join/switch-tenant OK. `CompleteOidcLogin` redime invitación global (path cross-IdP antes de resolver tenant) y escribe el link global↔tenant en el path institucional.
- Invitaciones globales: `POST /invitations/global` create OK; redención integrada en el callback OIDC (no hace falta endpoint redeem: el bind de email exige identidad IdP fresca).
- Miembros: alta directa por `handle` y por `globalUserId` OK (`findGlobalTenantLink`).
- Códigos efímeros: create/list/revoke OK; **sin update**.
- Auditoría: `membership_events` se usa por `membershipAdminRepo.recordEvent` (miembros). Puerto `IAuditLog` solo en memoria; invitaciones/códigos/join-requests/workspaces sin evento persistente.
- Rate limit: solo `create-workspace` (`admin-create-workspace`) e `ingestion`.
- Cleanup: invitaciones expiradas OK; guests 0.

### 2.3 Web (SvelteKit)
- Hecho: estado, route groups, canvas, governance, offline, E2E, admin UI completa. Direct add envía `handle` (B8 cerrado con P0-3).
- Pendiente: consumir `switch-tenant` en el selector (hoy cambia por re-auth o select-tenant); E2E flujos admin completos (códigos/invitaciones globales/roles); offline shell rutas admin.

### 2.4 DevOps / Seed
- Hecho: docker-compose (db/redis/ollama, perfiles idp/observability/app), headers, seed básico.
- Pendiente: HTTPS/reverse proxy (TLS real), verificar build contenedores api/web, seed PUBLIC/PRIVATE/invitaciones/roles múltiples, social logins en Zitadel.

---

## 3. Matriz de tareas v5 (aceptación vs. estado real)

| Task | Título | Real estado | Queda por hacer |
|------|--------|-------------|-----------------|
| v5-01 | Router DB identity (`global_users`) + linking | ✅ Hecho | Nada |
| v5-02 | Explicit tenant selection + selector | ✅ Hecho | Nada (`switch-tenant` cerrado 2026-10-28, commit 22c5481) |
| v5-03 | Ephemeral/revocable join codes | 🟡 Parcial | `Update` use case + endpoint PUT |
| v5-04 | Workspaces.kind + is_anonymous + GUEST | ✅ Hecho | Nada |
| v5-05 | Multiple roles per workspace | ✅ Hecho | Nada |
| v5-06 | Global invitations (cross-IdP) | ✅ Hecho | Nada (redención cableada en CompleteOidcLogin 2026-10-28; no requiere endpoint redeem dedicado) |
| v5-07 | Alta directa by handle/identity | ✅ Hecho | Nada (`findGlobalTenantLink` + web `handle`, commit 85ceb64) |
| v5-08 | Atomize auth flows + audit | 🟡 Parcial | IAuditLog persistente; cablear atómicos en controladores; auditoría en invitaciones/códigos/join-requests/workspaces |
| v5-09 | Social logins + knowledge transfer | 🟡 Parcial | Verificar config Zitadel (Google/Microsoft personal); knowledge transfer al día |

---

## 4. Matriz de tareas v6 (aceptación vs. estado real)

| Task | Título | Real estado | Queda por hacer |
|------|--------|-------------|-----------------|
| v6-01 | Tenant explícito en login + selector/switch | 🟡 Parcial | Backend cerrado (switch-tenant, commit 22c5481); queda que el selector web consuma `switch-tenant` sin re-auth |
| v6-02 | Guards GUEST + kind enforcement | ✅ Hecho | Nada |
| v6-03 | Alta directa por handle/identidad global | ✅ Hecho | Nada (backend + web + i18n, commit 85ceb64) |
| v6-04 | Códigos efímeros port/adapter/use cases | 🟡 Parcial | `Update` use case + endpoint PUT |
| v6-05 | Auto-aprobación configurable | ✅ Hecho | Nada |
| v6-06 | Invitaciones globales (router DB) | ✅ Hecho | Nada (redención en callback + link router, tests 2026-10-28) |
| v6-07 | Rate limit dedicado + auditoría (IAuditLog) | 🟡 Parcial | Rate limit en todas las rutas admin; IAuditLog persistente |
| v6-08 | Atomizar use cases | 🟡 Parcial | Cablear atómicos en controladores; no regresiones |
| v6-09 | Social logins Zitadel + cleanup endpoint/cron | 🟡 Parcial | Cleanup guests (DB-level); verificar social en identity lab |
| v6-10 | Web core | ✅ Hecho | E2E admin flujos; offline rutas admin |
| v6-11 | Web admin UI | ✅ Hecho | Direct add por `handle` |
| v6-12 | Seed + devops | 🟡 Parcial | Seed PUBLIC/PRIVATE/invitaciones/roles; HTTPS/reverse proxy; verificar contenedores |

---

## 5. Plan de cierre (priorizado, real)

### P0 — Seguridad y coherencia (cerrar antes de cualquier UX nuevo)
1. ~~**`switch-tenant`**~~ — **HECHO 2026-10-28** (commit 22c5481): endpoint + método en `AuthController` + wiring + 3 tests.
2. ~~**Redención de invitación global**~~ — **HECHO 2026-10-28**: `isGlobalToken` + redención en `CompleteOidcLogin` antes de resolver tenant + link `global_identity_tenants` (`linkGlobalTenant`, upsert) también en el login institucional + wiring en `server.ts` + 16 tests. Sin endpoint redeem dedicado (decisión: el bind de email exige identidad IdP fresca del callback).
3. ~~**Resolución `globalUserId` en alta directa**~~ — **HECHO 2026-10-28** (commit 85ceb64): `findGlobalTenantLink` + `routerDb` inyectado + web `handle` + tests.
4. **Auditoría persistente**: reimplementar `DrizzleAuditLog` sobre `ConnectionPoolManager` insertando en `auth.membership_events` (tenant) y `global_identity_events` (router); inyectar `IAuditLog` en use cases admin (invitaciones, códigos, join-requests, workspaces, miembros) y registrar evento por operación; tests.
5. **Rate limit por actor en rutas admin**: `scopedRateLimitMiddleware(rateLimiter, '<action>')` en invitaciones globales, códigos efímeros, join requests, workspaces (create/patch), cleanup, miembros; tests.

### P1 — Operación
6. Cleanup guests inactivos (nivel DB) + endpoint/cron.
7. Social logins en Zitadel (Google/Microsoft personal) + verificación en identity lab.
8. Seed: workspaces PUBLIC/PRIVATE ejemplo, invitaciones de ejemplo, roles múltiples demo.
9. Join codes `Update` (TTL/capacidad/label/auto_approve/revocar).

### P2 — Producto / UX
10. Atomización profunda: cablear use cases atómicos en controladores sin regresión; tests por operación.
11. E2E cobertura flujos admin completos (códigos, invitaciones globales, roles, selector tenant).
12. Offline shell rutas admin; HTTPS/reverse proxy (Caddy/Traefik) para producción.

---

## 6. Vulnerabilidades y mitigaciones (estado real)

| # | Vulnerabilidad | Estado | Mitigación |
|---|----------------|--------|------------|
| V1 | Token invitación en URL | Parcial | Single-use + TTL 72h + email-bound + Referrer-Policy no-referrer (ya). Pendiente: fragmento `#token` + HTTPS real. |
| V2 | Brute-force códigos/event | Parcial | Rate limit solo en create-workspace. Falta extender a auth públicas y admin. |
| V3 | XSS → robo token | Parcial | Token en memoria; CSP `default-src 'self'`; revisar inline scripts. |
| V4 | CSRF en `/auth/refresh` | Parcial | Cookie SameSite; double-submit pendiente. |
| V5 | Tenant mismatch → 404 | Implementado | Verificar en todos los endpoints. |
| V6 | Último admin | Implementado | Tests existen; verificar en suspend/reactivate. |
| V7 | Social email no verificado | Implementado | Invitación inredimible si `!emailVerified`. |
| V8 | Handle no único | Parcial | Índice unique en `users.handle`; validación UI pendiente. |
| V9 | Refresh family reuse | Implementado | Invalidación al suspender. |
| V10 | Invitación URL compartible | Aceptado | TTL corto, single-use, revocación, auditoría (ahora en memoria, P0 la persiste). |

---

## 7. Checklist de mejores prácticas (estado real)

- [x] Roles leídos de DB en cada request.
- [x] Workspace mismatch → 404.
- [x] Tenant admin vs workspace admin separados.
- [x] Separación física DBs (router vs tenant).
- [x] Guard order: auth → tenant/workspace → rateLimit.
- [x] Migraciones Drizzle generadas.
- [x] Security headers (nosniff, frame-options, referrer, HSTS, CSP).
- [x] `global_users` como SSO de identidad (router).
- [x] `membership_events` append-only (miembros).
- [ ] HTTPS/TLS real en producción.
- [ ] `IAuditLog` persistente (solo en memoria).
- [ ] Rate limit dedicado en todas las rutas admin.
- [x] `switch-tenant` endpoint (2026-10-28).
- [x] Redención invitación global end-to-end (2026-10-28).
- [x] Resolución `globalUserId` en alta directa (2026-10-28).
- [x] Link `global_identity_tenants` escrito en login y redención (2026-10-28; antes solo el script de reconciliación lo creaba).
- [ ] Social logins verificados en Zitadel.
- [ ] Seed completo (PUBLIC/PRIVATE/invitaciones/roles).
- [ ] Tests por operación atómica.

---

## 8. Trazabilidad

- Tasks v5: `docs/tasks/auth-onboarding-v5/TASK-01..09`.
- Tasks v6: `docs/tasks/auth-onboarding-v6/TASK-01..12` (sin subtasks 11.x/12.x activos; el trabajo real está en TASK-01..09 de v6 + v5).
- ADRs: ADR-0041 (admin model), ADR-0042 (cross-tenant/identity), ADR-0013 (authorHash pseudónimo), ADR-0025 (resolve-source), ADR-0026 (propuesta union kind), ADR-0028 (external identities).
- Análisis: este documento (estado actual).
- Knowledge transfer: `knowledge-transfer/08-identidad-tenencia-invitados.md` (verificar vigencia).
- Requirements: `docs/requirements.md` (US-00 + matriz de decisión).

---

## 9. Conclusión

El núcleo del modelo es coherente y está implementado (OIDC con tenant explícito, múltiples roles, GUEST/kind, códigos efímeros, invitaciones tenant y globales con redención operativa, alta directa por handle/identidad, switch-tenant, admin UI, canvas, gobernanza, offline, E2E). **Brechas P0 cerradas 2026-10-28:** `switch-tenant`, redención de invitaciones globales (incluido el link `global_identity_tenants` que antes solo escribía el reconcile), y resolución de `globalUserId` en alta directa. **Quedan abiertas las P0 de auditoría persistente (`IAuditLog`) y rate limit dedicado en rutas admin**, antes de avanzar a P1/P2.
