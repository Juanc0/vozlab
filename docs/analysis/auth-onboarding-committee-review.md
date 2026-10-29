# Revisión de arquitectura: autenticación y onboarding (tenant / workspace)

Comité: arquitectura + seguridad + producto + devops + frontend + base de datos.
Fecha: 2026-10-29 (v6 — estado REAL verificado sobre código, no aspiracional).
Contexto: VozLab multi-tenant (router DB `vozlab_router` + una DB por tenant), Fastify API + SvelteKit 5 PWA, OIDC (Zitadel local en `:8081` vía identity-lab, actualmente CAÍDO en dev), event join anónimo, workspaces con admin tenant/workspace, join requests, invitaciones email-bound (solo URL, sin servicio de email), códigos efímeros, invitaciones globales cross-IdP, roles múltiples por workspace.

Estado de referencia: `pnpm turbo run build type-check test` VERDE (334 tests API, 521 tests web). Las cinco P0 están cerradas (commits `22c5481`, `f1a28e9`, `85ceb64`, `835468c`, `150e067`), el login real contra Zitadel está **verificado end-to-end** (B13, §6.5), el selector de tenants web está cerrado (v6-01) y las P1 **B6** (`e9bde8b`), **B7** (`7833c75`) y **B10** (seed v6, 2026-10-29) están cerradas con evidencia E2E. Cerrada también la brecha **B14** recién encontrada (el handle JIT nunca se escribía — verificado en vivo: `testuser` reparado por `select-tenant` con el código nuevo). Quedan B9 (social logins), B11 (HTTPS) y B12 (atomización, P2).

---

## 0. Resumen ejecutivo (estado real, verificado sobre código)

### Lo que SÍ está hecho y funciona
- DB: `global_users`, `global_identity_tenants`, `global_invitations`, `global_identity_events` (router); `workspaces` (+`kind`, `auto_approve_join_code`, `join_code`), `users` (+`handle`, `is_anonymous`, `provider`), `workspace_memberships` (PK única por `(workspace, user, role)`), `workspace_join_codes`, `invitations`, `workspace_join_requests`, `membership_events` (append-only), `external_identities`.
- Migraciones: router 0000–0009, tenant 0000–0016. `db:migrate:router` / `db:migrate:tenant`.
- Ports/adapters: `IGlobalUserRepository`, `IGlobalInvitationRepository`, `IWorkspaceJoinCodeRepository`, `IAuditLog` (puerto), `DrizzleAuditLog` (**persistente**: tenant `membership_events` + router `global_identity_events`; `InMemoryAuditLog` queda solo para tests), `IGlobalIdentityEventRepository` (implementa `RouterDatabaseClient`), `DrizzleWorkspaceJoinCodeRepository`, `RouterDatabaseClient` (implementa `IRouterDatabase`, `IGlobalUserRepository`, `IGlobalInvitationRepository`, `ITenantIdentityProviderRepository`, `IEventCodeRepository`, `IGlobalIdentityEventRepository`).
- Use cases atómicos ya creados: `ResolveTenantsUseCase`, `SelectTenantUseCase`, `ManageRoleAtomicUseCase`, `RedeemInvitationAtomicUseCase`, `CreateGlobalInvitationUseCase`, `RedeemGlobalInvitationUseCase`, `CreateWorkspaceJoinCodeUseCase`, `RotateJoinCodeUseCase`, `CleanupExpiredInvitationsUseCase`.
- `CompleteOidcLoginUseCase`: upserta `global_users`, redime invitación GLOBAL antes de resolver tenant, escribe el link `global_identity_tenants` en todo login institucional, resuelve tenants linked, `requiresTenantSelection`, `linkedTenants`, `globalUserId`, redención de invitación tenant-local, emite refresh token (`issueSession` compartido por ambos paths).
- Endpoints auth: `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/event-join`, `/auth/select-tenant`, `/auth/resolve-tenants`, `/auth/switch-tenant` (P0-1 cerrado 2026-10-28, commit 22c5481).
- Endpoints admin: `/admin/workspaces` (GET/POST), `/invitations/global` (create; redención vía callback OIDC), `/workspaces/:id/join-codes` (POST/GET/DELETE; **sin PUT/update**; rotate en `/join-code/rotate`), `/admin/users`, `/admin/cleanup` (invitaciones expiradas OK; guests = 0 placeholder). Todas las escrituras con bucket `scoped` por acción (P0-5).
- Miembros: list, add (handle y globalUserId resueltos; P0-3), change role, assign/remove role, suspend, reactivate, remove.
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
| B4 | ~~`IAuditLog` solo en memoria~~ — **CERRADO 2026-10-28**: `DrizzleAuditLog` persistente (tenant `membership_events` + router `global_identity_events`, enrutado por `targetType`/`tenantId`, fail-loud si falta workspace/tenant). Inyectado en códigos efímeros (create/rotate), join requests (creación y auto-aprobación) y redención global. Miembros/invitaciones/workspaces ya registraban vía `recordEvent`. 6 tests de adapter + 4 de use case. Falta: migrar `CompleteOidcLogin`/`SelectTenant` a eventos explícitos (queda en v6/TASK-07 junto con rate limit). | v6/TASK-07, v5/TASK-08 | P0 — auditoría append-only |
| B5 | ~~Rate limit dedicado solo en `create-workspace`~~ — **CERRADO 2026-10-28**: helper `scoped(scope)` en `routes.ts` con `scopedRateLimitMiddleware` por acción en las 20 rutas de escritura admin/onboarding (`admin-create-workspace`, `admin-global-invitation`, `admin-cleanup`, `auth-switch-tenant`, `admin-join-code` ×3, `admin-workspace`, `admin-member` ×7, `admin-join-request` ×2, `admin-invitation` ×2, `join-request-create`); bucket por `authorHash` del actor. Extra: `switch-tenant` llevaba `[auth, scoped]` sin `tenant`, por lo que `req.tid` no estaba resuelto y el limiter se saltaba en silencio — añadido `tenant` a la cadena. 41 tests de tabla de rutas. | v6/TASK-07 | ~~P0~~ ✅ |
| B6 | ~~Join codes sin Update~~ — **CERRADO 2026-10-29** (commit `e9bde8b`): puerto `findById`+`update(patch)`, `UpdateWorkspaceJoinCodeUseCase` (assertWorkspaceAdmin, 404 propio `ERR_JOIN_CODE_NOT_FOUND`, revocado congelado, cap ≥ usado, auditoría `JOIN_CODE_UPDATED`), `PATCH /workspaces/:id/join-codes/:codeId` con `scoped('admin-join-code')`, formulario inline en admin. 5+2 tests + E2E real. | v6/TASK-04 | ~~P1~~ ✅ |
| B7 | ~~Cleanup guests inactivos = 0~~ — **CERRADO 2026-10-29** (commit `7833c75`): `IUserRepository.removeInactiveGuests` (borra guests anonimos sin NINGUN signal: cuenta, membresias, eventos ni emision de refresh token desde el corte), barrido opt-in por `inactiveGuestDays` (1..3650), UI "Higiene del inquilino". 5 tests + E2E real (guest de 100 días cae con cascadas, activo se preserva, auditoría append-only sobrevive). | v6/TASK-09 | ~~P1~~ ✅ |
| B8 | ~~Web direct add envía `email`~~ — **CERRADO 2026-10-28** (commit 85ceb64): `addMember` envía `handle`, i18n es/en. | v6/TASK-03, v11 | ~~P1~~ ✅ |
| B9 | **Social logins no verificados** en Zitadel (doc existe, infra no probada). | v6/TASK-09, v5/TASK-09 | P1 |
| B10 | ~~Seed incompleto~~ — **CERRADO 2026-10-29**: `seed-dev.ts` siembra `general`/`community` (PUBLIC), `paper-lab` (PRIVATE con hint) y `evento-demo` (EVENT) con join codes efímeros (cap/expiry/auto-approve variados), dos invitaciones de ejemplo (PENDING con URL `/login?invitation=…` + EXPIRED para el sweep), roles múltiples (`dev-member` = MODERATOR+MEMBER en `general`) y handles `dev-maintainer/dev-moderator/dev-member`. Idempotencia verificada (dos pasadas) y E2E en admin. | v6/TASK-12 | ~~P1~~ ✅ |
| B14 | ~~`auth.users.handle` no se escribe en el login JIT~~ — **CERRADO 2026-10-29** (descubierta al cerrar B10: los usuarios OIDC reales tenían `handle = NULL` y la alta directa por handle solo funcionaba contra identidades sembradas). `deriveHandle()` en `shared/auth/deriveHandle.ts` (local-part del email → subject con prefijo `u-`, normalizado [a-z0-9_-] ≤64, determinista) alimentado por `NewExternalIdentityInput.handle`; los cuatro caminos que tocan el usuario de tenant (`CompleteOidcLogin`, `SelectTenant` — el sitio del login multi-tenant, donde el perfil del router no trae preferred_username —, `RedeemGlobalInvitation`, `DirectIdentityAdd`) lo pasan, y el adaptador lo inserta en el alta y lo **repara en cada entrada al tenant** sin pisar uno ya puesto; colisión de alias deja NULL (es alias de búsqueda, no credencial — el login no puede fallar por él). Tests: 6 de `deriveHandle` + aserción en el flujo + 1 del claim propuesto. | v6/TASK-03 | ~~P1~~ ✅ |
| B11 | **HTTPS/reverse proxy pendiente** (solo headers). | v6/TASK-12 | P1 — producción |
| B12 | **Atomización parcial**: `CompleteOidcLogin` y otros siguen monolíticos; los use cases atómicos existen pero no todos están cableados en controladores. | v6/TASK-08, v5/TASK-08 | P2 |
| B13 | **Login Zitadel caído (RESUELTO 2026-10-28, verificado E2E)** — tres causas reales, ninguna era el código de auth: (1) la migración de router `0009_rename_global_identities` escrita a mano nunca se registró en `meta/_journal.json` → `global_users` no existía → `ERR_DATABASE_CONNECTION_FAILED` (fix `f0890e9`); (2) el volumen dev tenía el tenant DB a 0014/0017 → `auth.users.handle` ausente (aplicado `db:migrate:tenant`); (3) carrera de doble-send de Fastify 4.29 con dos hooks `onSend` async: `sendError()` resuelve con `undefined` con la cadena pendiente y `wrapThenable` re-envía → `ERR_HTTP_HEADERS_SENT` **mata el proceso API** en cualquier respuesta de error de auth (fix `1c77d29`, hooks ahora callback-sync + test de regresión) | v6/TASK-01, v5/TASK-02 | ~~P0~~ ✅ |

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
- Auditoría: `DrizzleAuditLog` persistente desde 2026-10-28 — eventos de miembros/invitaciones/workspaces vía `recordEvent` y de códigos efímeros, join requests (creación + auto-aprobación) y redención global vía `IAuditLog`. Faltan por migrar: eventos explícitos de login/select-tenant (queda con v6/TASK-07).
- Rate limit: genérico por workspace/actor (`limit`) en todas las protegidas + bucket dedicado por acción (`scoped`) en las 20 rutas de escritura admin/onboarding desde 2026-10-28 (P0-5).
- Cleanup: invitaciones expiradas OK; guests 0.

### 2.3 Web (SvelteKit)
- Hecho: estado, route groups, canvas, governance, offline, E2E, admin UI completa. Direct add envía `handle` (B8 cerrado con P0-3). **Selector de tenant cerrado (v6/TASK-01, 2026-10-28)**: `/auth/me` expone `globalUserId` + `tenantId` (nuevo puerto `findGlobalIdentityForTenantUser` en el router); `TenantSwitcher` en la barra lateral cambia de institución sin re-auth (`switch-tenant` → `refresh` serializado → recarga de membresías); la página `select-tenant` del primer login ahora funciona (antes pedía el contexto con clave equivocada y enviaba `{tenantId}` sin `globalUserId`).
- Pendiente: E2E flujos admin completos (códigos/invitaciones globales/roles); offline shell rutas admin.

### 2.4 DevOps / Seed
- Hecho: docker-compose (db/redis/ollama, perfiles idp/observability/app), headers. **Seed v6 completo (B10, 2026-10-29)**: workspaces `general`/`community` (PUBLIC), `paper-lab` (PRIVATE), `evento-demo` (EVENT); join codes efímeros con cap/expiry/auto-approve variados; dos invitaciones de ejemplo (PENDING con URL `/login?invitation=…` + EXPIRED para el sweep); roles múltiples (`dev-member` = MODERATOR+MEMBER en `general`); handles `dev-maintainer/dev-moderator/dev-member` para la alta directa. Idempotencia verificada (dos pasadas) y E2E en `/admin`.
- Pendiente: HTTPS/reverse proxy (TLS real, B11), verificar build contenedores api/web, social logins en Zitadel (B9).

---

## 3. Matriz de tareas v5 (aceptación vs. estado real)

| Task | Título | Real estado | Queda por hacer |
|------|--------|-------------|-----------------|
| v5-01 | Router DB identity (`global_users`) + linking | ✅ Hecho | Nada |
| v5-02 | Explicit tenant selection + selector | ✅ Hecho | Nada (`switch-tenant` cerrado 2026-10-28, commit 22c5481) |
| v5-03 | Ephemeral/revocable join codes | ✅ Hecho | Nada (`Update` use case + `PATCH` + UI inline, commit `e9bde8b`, E2E 2026-10-29) |
| v5-04 | Workspaces.kind + is_anonymous + GUEST | ✅ Hecho | Nada |
| v5-05 | Multiple roles per workspace | ✅ Hecho | Nada |
| v5-06 | Global invitations (cross-IdP) | ✅ Hecho | Nada (redención cableada en CompleteOidcLogin 2026-10-28; no requiere endpoint redeem dedicado) |
| v5-07 | Alta directa by handle/identity | ✅ Hecho | Nada (`findGlobalTenantLink` + web `handle`, commit 85ceb64) |
| v5-08 | Atomize auth flows + audit | 🟡 Parcial | `IAuditLog` persistente HECHA (2026-10-28: códigos, join-requests, redención global; invitados/workspaces ya vía recordEvent); falta cablear atómicos en controladores |
| v5-09 | Social logins + knowledge transfer | 🟡 Parcial | Verificar config Zitadel (Google/Microsoft personal); knowledge transfer al día |

---

## 4. Matriz de tareas v6 (aceptación vs. estado real)

| Task | Título | Real estado | Queda por hacer |
|------|--------|-------------|-----------------|
| v6-01 | Tenant explícito en login + selector/switch | ✅ Hecho | Nada (backend `22c5481` + selector web `TenantSwitcher` verificado E2E contra Zitadel 2026-10-28) |
| v6-02 | Guards GUEST + kind enforcement | ✅ Hecho | Nada |
| v6-03 | Alta directa por handle/identidad global | ✅ Hecho | Nada (backend + web + i18n, commit 85ceb64; escritura del handle en el cierre de B14 2026-10-29, E2E: alta de `dev-moderator` por handle en `paper-lab`) |
| v6-04 | Códigos efímeros port/adapter/use cases | ✅ Hecho | Nada (`Update` + `PATCH` + UI, commit `e9bde8b`) |
| v6-05 | Auto-aprobación configurable | ✅ Hecho | Nada |
| v6-06 | Invitaciones globales (router DB) | ✅ Hecho | Nada (redención en callback + link router, tests 2026-10-28) |
| v6-07 | Rate limit dedicado + auditoría (IAuditLog) | ✅ Hecho | Nada (auditoría persistente + rate limit por acción, 2026-10-28; eventos de login/select-tenant quedan como mejora P2) |
| v6-08 | Atomizar use cases | 🟡 Parcial | Cablear atómicos en controladores; no regresiones |
| v6-09 | Social logins Zitadel + cleanup endpoint/cron | 🟡 Parcial | Verificar social en identity lab (B9); cleanup de guests HECHO (commit `7833c75`); cron opcional no cableado |
| v6-10 | Web core | ✅ Hecho | E2E admin flujos; offline rutas admin |
| v6-11 | Web admin UI | ✅ Hecho | Nada (direct add por `handle` E2E-verificado con handles sembrados 2026-10-29; edición inline de códigos, `e9bde8b`) |
| v6-12 | Seed + devops | 🟡 Parcial | Seed HECHO (2026-10-29: PUBLIC/PRIVATE/EVENT + códigos + invitaciones + roles múltiples + handles); falta HTTPS/reverse proxy (B11) y verificar contenedores api/web |

---

## 5. Plan de cierre (priorizado, real)

### P0 — Seguridad y coherencia (cerrar antes de cualquier UX nuevo)
1. ~~**`switch-tenant`**~~ — **HECHO 2026-10-28** (commit 22c5481): endpoint + método en `AuthController` + wiring + 3 tests.
2. ~~**Redención de invitación global**~~ — **HECHO 2026-10-28**: `isGlobalToken` + redención en `CompleteOidcLogin` antes de resolver tenant + link `global_identity_tenants` (`linkGlobalTenant`, upsert) también en el login institucional + wiring en `server.ts` + 16 tests. Sin endpoint redeem dedicado (decisión: el bind de email exige identidad IdP fresca del callback).
3. ~~**Resolución `globalUserId` en alta directa**~~ — **HECHO 2026-10-28** (commit 85ceb64): `findGlobalTenantLink` + `routerDb` inyectado + web `handle` + tests.
4. ~~**Auditoría persistente**~~ — **HECHO 2026-10-28**: `DrizzleAuditLog` sobre `ConnectionPoolManager` (`membership_events`) + `IGlobalIdentityEventRepository` sobre router (`global_identity_events`); inyectado en códigos efímeros, join requests y redención global; 10 tests. Queda migrar `CompleteOidcLogin`/`SelectTenant` a eventos explícitos y cablear los atómicos (v6/TASK-07/08).
5. ~~**Rate limit por actor en rutas admin**~~ — **HECHO 2026-10-28**: `scoped()` en las 20 rutas de escritura (miembros, invitaciones, códigos, join requests, workspaces, cleanup, switch-tenant) + 41 tests; corregido el salto silencioso del limiter en `switch-tenant` (faltaba el guard `tenant`).

### P1 — Operación
6. ~~Cleanup guests inactivos~~ — **HECHO 2026-10-29** (commit `7833c75`): `removeInactiveGuests` con señales de actividad reales, barrido opt-in + UI; cron opcional sigue pendiente.
7. Social logins en Zitadel (Google/Microsoft personal) + verificación en identity lab.
8. ~~Seed: workspaces PUBLIC/PRIVATE, invitaciones, roles múltiples~~ — **HECHO 2026-10-29**: seed v6 completo (ver B10/§2.4), idempotencia doble pasada + E2E en `/admin`.
9. ~~Join codes `Update`~~ — **HECHO 2026-10-29** (commit `e9bde8b`): `PATCH /workspaces/:id/join-codes/:codeId` + edición inline en admin.

### P2 — Producto / UX
10. Atomización profunda: cablear use cases atómicos en controladores sin regresión; tests por operación.
11. E2E cobertura flujos admin completos (códigos, invitaciones globales, roles, selector tenant).
12. Offline shell rutas admin; HTTPS/reverse proxy (Caddy/Traefik) para producción.

---

## 6. Vulnerabilidades y mitigaciones (estado real)

| # | Vulnerabilidad | Estado | Mitigación |
|---|----------------|--------|------------|
| V1 | Token invitación en URL | Parcial | Single-use + TTL 72h + email-bound + Referrer-Policy no-referrer (ya). Pendiente: fragmento `#token` + HTTPS real. |
| V2 | Brute-force códigos/event | Hecho | `publicAuthRateLimitMiddleware` en auth públicas; bucket `scoped` por acción admin desde 2026-10-28 (P0-5); rate-based rule del limiter por actor (`authorHash`). |
| V3 | XSS → robo token | Parcial | Token en memoria; CSP `default-src 'self'`; revisar inline scripts. |
| V4 | CSRF en `/auth/refresh` | Parcial | Cookie SameSite; double-submit pendiente. |
| V5 | Tenant mismatch → 404 | Implementado | Verificar en todos los endpoints. |
| V6 | Último admin | Implementado | Tests existen; verificar en suspend/reactivate. |
| V7 | Social email no verificado | Implementado | Invitación inredimible si `!emailVerified`. |
| V8 | Handle no único | Parcial | Índice unique en `users.handle`; validación UI pendiente. |
| V9 | Refresh family reuse | Implementado | Invalidación al suspender. |
| V10 | Invitación URL compartible | Aceptado | TTL corto, single-use, revocación, auditoría (ahora en memoria, P0 la persiste). |

---

## 6.5 Verificación E2E del login real (2026-10-28, Zitadel vía zrok)

Flujo completo con navegador automatizado contra el entorno dev real (`vozlabdemo`/`vozlabapi`/`vozlabauth` vía zrok, API y web como procesos host):

1. `/login` → botón "Cuenta local (Zitadel)" → `302` a `vozlabauth/oauth/v2/authorize` (state+PKCE OK).
2. Zitadel: `testuser` + password → prompt 2FA (Skip) → callback `vozlabapi/api/v1/auth/callback`.
3. Primera intentos fallaron y revelaron B13 (journal sin 0009; tenant DB a 0014; crash doble-send). Tras los fixes `f0890e9`/`1c77d29` + `db:migrate:tenant`: **login completado**.
4. Evidencia en DB: `global_users` upsertado (`testuser@example.org`, verificado), `global_identity_tenants` con link ACTIVE (`84e38267… → c3fa967b…`, escrito por `linkGlobalTenant` de P0-2 en el login), `auth.users` JIT con `global_identity_id`, refresh token emitido; la PWA muestra "Sesión iniciada como Test User" y el empty-state correcto de "sin workspace" (sin membresía, por diseño).
5. Ninguna membresía se crea en login JIT (US-00 lo prohíbe); el invite entra por invitación/código/solicitud — flujos E/F/B probados unitariamente, pendientes de E2E (P2/TASK-10).
6. **Selector de tenants E2E (2026-10-28)**: con la identidad `testuser` vinculada a dos instituciones (`sabana` + `local`), el callback redirige a `/select-tenant?gid=…` (la ruta `resolve-tenants` antes no estaba registrada y el page usaba claves de contexto/DTO incorrectas — ambas corregidas), la elección crea la sesión, y el `TenantSwitcher` de la barra lateral cambia `sabana → local → sabana` con `switch-tenant(200) → refresh(200) → me(200)` sin re-autenticar y sin un solo `ERR_` en el log de la API. Prueba unitaria web: 4 casos en `tenant-switcher.test.ts`.
7. **Seed v6 + handle JIT E2E (2026-10-29)**: `/admin` (testuser, sesión Zitadel real) lista los 4 workspaces con badges `PUBLIC/PUBLIC/PRIVATE/EVENT`; `general` muestra a `Dev Member` con **dos chips de rol** (MODERATOR+MEMBER — regla de unión v5); la alta directa por `handle` funcionó por primera vez (añadir `dev-moderator` a `paper-lab` → 200, fila en `workspace_memberships`); limpieza con ventana 30 dejó la invitación PENDING y contó la EXPIRED. Con B14 cableado, el login real de `testuser` reparó su `handle` a `testuser` (Zitadel afirma `preferred_username`; en su defecto, la parte local del email). Gates: 334 tests API / 521 web, `db:seed:dev` idempotente (dos pasadas sin deltas).

Nota ops: el proceso API **no debe** correr bajo `pnpm --filter @vozlab/api dev` sin supervisor si se prueban paths de error (el crash histórico mataba el listener; zrok devolvía 502). Con el fix, la API sobrevive respuestas 401/422 repetidas.

## 7. Checklist de mejores prácticas (estado real)

- [x] Roles leídos de DB en cada request.
- [x] Workspace mismatch → 404.
- [x] Tenant admin vs workspace admin separados.
- [x] Separación física DBs (router vs tenant).
- [x] Guard order: auth → tenant/workspace → rateLimit.
- [x] Migraciones Drizzle generadas.
- [x] Security headers (nosniff, frame-options, referrer, HSTS, CSP).
- [x] `global_users` como SSO de identidad (router).
- [x] Login OIDC real contra Zitadel verificado end-to-end (§6.5, 2026-10-28).
- [x] `membership_events` append-only (miembros).
- [ ] HTTPS/TLS real en producción.
- [x] `IAuditLog` persistente (`DrizzleAuditLog`: `membership_events` + `global_identity_events`, 2026-10-28).
- [x] Rate limit dedicado en todas las rutas admin de escritura (P0-5, 2026-10-28).
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

El núcleo del modelo es coherente y está implementado (OIDC con tenant explícito, múltiples roles, GUEST/kind, códigos efímeros, invitaciones tenant y globales con redención operativa, alta directa por handle/identidad, switch-tenant, auditoría persistente, rate limit por acción, admin UI, canvas, gobernanza, offline, E2E). **Las cinco brechas P0 están cerradas 2026-10-28:** `switch-tenant`, redención de invitaciones globales (incluido el link `global_identity_tenants`), resolución de `globalUserId` en alta directa, `IAuditLog` persistente (`membership_events` + `global_identity_events`) y rate limit dedicado en las rutas de escritura admin. El siguiente bloque es P1: cleanup de guests, join-code Update, seed completo, HTTPS y consumo web de `switch-tenant`.
