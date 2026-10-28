# Revisión de arquitectura: autenticación y onboarding (tenant / workspace)

Comité: arquitectura + seguridad + producto + devops. Fecha: 2026-10-29 (v6 — estado actual tras P0/P1/P2).
Contexto: VozLab multi-tenant (router DB + una DB por tenant), Fastify API + SvelteKit PWA, OIDC (Zitadel), event join anónimo, workspaces con admin tenant/workspace, join requests, invitaciones email-bound (solo URL, sin envío de email).

Estado de referencia: commits hasta P2 (docs/notes/*, docs/tasks/auth-onboarding-v5/*). Build/type-check/tests verdes (242 API tests).

---

## 0. Resumen ejecutivo (estado actual)

**Hecho (P0):**
- Schema DB: `global_users` (router, renombrado), `global_user_tenants`, `workspace_join_codes`, `workspaces.kind`, `users.is_anonymous`, `users.handle`, `workspace_memberships` PK compuesta `(workspace, user, role)`, `global_invitations`.
- Ports/adapters: `IGlobalUserRepository` (findOrCreate + updateProfile + findById), `findTenantsByGlobalUser`, `getRoles` (unión), `revokeAllForUser`.
- Shared-types: `WorkspaceRole` incluye `GUEST`.
- Use cases: `ResolveTenantsUseCase`, `SelectTenantUseCase`, `CleanupExpiredInvitationsUseCase`, `IAuditLog` port.
- `CompleteOidcLoginUseCase` upserta perfil en `global_users` y devuelve `linkedTenants`.
- `SuspendMemberUseCase` invalida refresh family.
- `DrizzleWorkspaceRepository` mapea `kind`.
- Migraciones router (0007–0009) y tenant (0014–0016) generadas.
- Docs: ADR-0042, requirements.md (US-00 + matriz de decisión), knowledge-transfer/08, tasks index, notas P2.

**Hecho (P1):**
- Rate limit dedicado por actor (`scopedRateLimitMiddleware` keyed por authorHash/ip).
- Selector/switch de tenant: use cases creados.
- Social logins: guía Zitadel.
- Limpieza: stub use case.

**Hecho (P2):**
- Matriz de decisión documentada.
- Notas de QR, atomización, consolidación UI.

**Pendiente (brechas):** integración end-to-end de invitaciones globales, tenant explícito en CompleteOidcLogin, guards GUEST/kind, códigos efímeros port/adapter/use cases, alta directa por handle, atomización profunda, UI web, seed/devops.

---

## 1. Inventario de flujos por emisor y propósito

| # | Flujo | Emisor | Propósito | Credencial | Resultado | Estado |
|---|-------|--------|-----------|------------|-----------|--------|
| A | OIDC login | Usuario humano | Entrar al tenant | Código OIDC + state | Sesión + usuario + membresías | Implementado (tenant por claims; selector pendiente) |
| B | Event join | Asistente anónimo | Participar en evento | Código de evento global | Usuario anónimo + GUEST en workspace EVENT | Implementado (guards GUEST pendientes) |
| C | Descubrimiento público | Usuario autenticado | Pedir acceso a workspace público | Ninguna | Solicitud PENDING | Implementado |
| D | Join request por código | Usuario autenticado | Pedir acceso a workspace privado | `join_code` | Solicitud PENDING | Implementado (código estático; efímero pendiente) |
| E | Invitación email-bound | Admin workspace | Onboarding con rol | Token raw URL/QR | Sesión + membresía con rol | Implementado (same-IdP; global pendiente) |
| F | Alta directa por admin | Admin workspace | Añadir usuario existente | Identidad global/handle | Membresía ACTIVE | Parcial (usa email; handle pendiente) |
| G | Aprobación join request | Admin workspace | Convertir PENDING→ACTIVE | — | Membresía ACTIVE | Implementado |

---

## 2. Estado por capa

### 2.1 Base de datos

**Router DB (`vozlab_router`):**
- `global_users` (renamed): id, issuer, subject, email, email_verified, full_name, picture, last_login_at, created_at, last_seen_at. UNIQUE(issuer,subject). ✅
- `global_user_tenants`: global_user_id, tenant_id, tenant_user_id, status, first_seen_at, last_seen_at. ✅
- `global_invitations`: token_hash, tenant_id, workspace_id, role, email, status, max_uses, used_count, expires_at, created_at. ✅ (esquema; use cases pendientes)
- `event_codes`, `tenants`, `tenant_connections`, `tenant_identity_providers`, `global_identity_events`. ✅

**Tenant DB (`vozlab_tenant_dev`):**
- `auth.workspaces`: + `kind` (varchar), `join_code`. ✅ schema; default 'PRIVATE'.
- `auth.users`: + `is_anonymous`, `handle` (unique). ✅ schema.
- `auth.workspace_memberships`: PK compuesta `(workspace_id, user_id, role)`. ✅ schema; migración 0014.
- `auth.workspace_join_codes`: id, workspace_id, code_hash, label, expires_at, max_uses, used_count, auto_approve, revoked_at, created_by, created_at. ✅ schema.
- `auth.invitations`, `auth.workspace_join_requests`, `auth.membership_events`. ✅

**Migraciones:** router 0000–0009, tenant 0000–0016. Aplicar con `db:migrate:router` / `db:migrate:tenant`.

**Seed/devops:** `db:seed:dev` crea tenant admin + workspace join code. Falta seed de workspaces kind=EVENT y códigos efímeros de ejemplo. `docker compose up -d --build` provisiona Postgres/Redis/Ollama; init SQL solo en volumen fresco.

### 2.2 API

**Implementado:**
- Auth: StartOidcLogin, CompleteOidcLogin (upsert global_users, linkedTenants), Refresh, Logout, GetMe.
- Workspaces: CRUD, join code rotate (estático), list with stats, discover public.
- Members: list, add (por email aún), change role, suspend (invalida refresh), reactivate, remove.
- Join requests: list, approve, reject, request access, list mine, discover.
- Invitations: create (tenant-local), list, revoke.
- Guards: authGuard, tenantWorkspaceGuard, tenantAdminGuard, workspaceAdminGuard (unión de roles).
- Event join: consume code, create anonymous user + GUEST membership.
- Source resolution: resolve-source (agent-only, tenant-scoped).

**Pendiente (API):**
- `POST /api/v1/auth/select-tenant`, `switch-tenant`.
- `POST /api/v1/workspaces/:id/join-codes` (CRUD efímeros) + adaptar RequestWorkspaceAccess a nueva tabla.
- `POST /api/v1/invitations/global` (router DB) + redeem cross-IdP.
- Alta directa por handle/identidad global (adaptar AddWorkspaceMember).
- Guards GUEST: restringir a EVENT, no crear workspaces, no request access a otros.
- Auto-aprobación configurable por workspace (`autoApproveJoinCode`).
- Atomizar use cases + auditoría (IAuditLog implementación).
- Rate limit dedicado por actor en rutas admin (middleware existe, falta cablear).
- Cleanup endpoint (invitaciones expiradas + guests inactivos).

### 2.3 Web (SvelteKit)

**Implementado:** scaffold 3.1 (SSR, manifest, SW), `/admin` page, `/request-access` page, admin API module, sidebar entries, i18n es/en.

**Pendiente (Web):**
- Estado global (auth store, workspace store).
- Route groups ((auth), (app)).
- Cytoscape canvas.
- Governance UI (propuestas).
- Offline shell.
- E2E suite completa (solo smoke admin.spec.ts).
- UI de selector de tenant post-login.
- UI de gestión de códigos efímeros (crear/editar/revocar, mostrar raw una vez).
- UI de invitación global (generar URL/QR).
- Consolidación de "Miembros" (direct add + join requests).
- UI de roles múltiples (lista, asignar/retirar).
- Badges de kind (EVENT/PUBLIC/PRIVATE).
- QR con ambos códigos (cliente).

### 2.4 DevOps / Seed

- `docker compose up -d --build`: Postgres 18 (vozlab/postgres:18-age-pgvector), Redis 7, Ollama. Init SQL solo en volumen fresco.
- `docker compose --profile idp up -d`: Zitadel en :8081. Setup: scripts/setup-zitadel.sh.
- `docker compose --profile observability up -d`: Prometheus/Grafana/Tempo.
- API y web son procesos host (no contenedores): `pnpm --filter @vozlab/api dev`, `pnpm --filter @vozlab/web dev`.
- Seed: `db:seed:dev` (tenant admin + workspace join code). Falta seed de workspaces EVENT, códigos efímeros, invitaciones de ejemplo.
- CI: .github/workflows/ci.yml (TS gate, Python gate, worker image builds).
- Workers: embedder, relacionador, extractor (Python/uv). Consolidador pendiente.

---

## 3. Vulnerabilidades y mitigaciones

| # | Vulnerabilidad | Estado | Mitigación |
|---|----------------|--------|------------|
| V1 | Token invitación en URL (historial/logs/referrer) | Parcial | Single-use + TTL 72h + email-bound + HTTPS. Pendiente: fragmento `#token`, Referrer-Policy no-referrer. |
| V2 | Brute-force códigos de evento | Parcial | Rate limit por IP pendiente de cablear. Códigos ≥128 bits. |
| V3 | XSS → robo access token | Parcial | CSP estricta pendiente; token en memoria (OK). |
| V4 | CSRF en /auth/refresh | Parcial | SameSite cookie; double-submit pendiente. |
| V5 | Tenant mismatch → 404 | Implementado | Verificar todos los endpoints. |
| V6 | Último admin | Implementado | Verificar en suspensión/reactivación. |
| V7 | Social login email no verificado | Implementado | Invitación inredimible si !emailVerified. |
| V8 | Handle no único | Parcial | Índice unique creado; validación pendiente. |
| V9 | Refresh family reuse | Implementado | Detección + invalidación al suspender. |
| V10 | Invitación URL compartible (riesgo residual) | Aceptado | TTL corto, single-use, revocación, auditoría. |

---

## 4. Mejores prácticas (checklist)

- [x] Roles leídos de DB en cada request.
- [x] Workspace mismatch → 404.
- [x] Invitación: email-bound, single-use, TTL, hash at rest, revoke-previous, redención estricta, race-safe.
- [x] Código de workspace solo enruta solicitud (salvo auto-aprobación).
- [x] Protección del último admin.
- [x] Tenant admin vs workspace admin separados.
- [x] Eventos publicados after-commit best-effort.
- [x] Separación física DBs (router vs tenant).
- [x] Guard order: authGuard → tenantWorkspaceGuard/workspaceAdminGuard → rateLimit.
- [x] Migraciones drizzle generadas.
- [ ] HTTPS/HSTS en producción (devops).
- [ ] Tokens opacos (SHA-256 at rest), single-use, TTL corto (invitaciones OK; códigos efímeros pendiente).
- [ ] Idempotencia en endpoints de creación.
- [ ] Auditoría append-only (port creado; implementación pendiente).
- [ ] No PII en router DB excepto identidad (OK: global_users tiene email/nombre mínimo).
- [ ] Validación Zod en todos los inputs (parcial).
- [ ] Tests por operación atómica (pendiente atomización).

---

## 5. Siguientes pasos (priorizados)

### P0 (cerrar brechas de seguridad/coherencia)
1. Integrar tenant explícito en CompleteOidcLogin (usar ResolveTenants/SelectTenant cuando >1 tenant).
2. Implementar guards GUEST (restringir a EVENT, no crear workspaces, no request access a otros).
3. Adaptar AddWorkspaceMember a handle/identidad global.
4. Adaptar RequestWorkspaceAccess a workspace_join_codes (efímeros).
5. Auto-aprobación configurable por workspace (autoApproveJoinCode).
6. Invitaciones globales: use cases CreateGlobalInvitation + RedeemGlobalInvitation (router DB).
7. Cablear rate limit dedicado por actor en rutas admin.

### P1 (operación)
8. Implementar IAuditLog (Drizzle adapter + eventos).
9. Atomizar use cases (split monolíticos).
10. Social logins en Zitadel (config).
11. Cleanup endpoint + cron (invitaciones expiradas + guests inactivos).
12. Selector/switch de tenant en web + API.

### P2 (producto/UX)
13. UI web: estado global, route groups, Cytoscape, governance, offline, E2E.
14. UI: gestión códigos efímeros, invitación global, roles múltiples, badges kind, selector tenant, consolidación Miembros.
15. QR con ambos códigos (cliente).
16. Seed: workspaces EVENT, códigos efímeros, invitaciones de ejemplo.
17. Devops: contenerizar API/web, HTTPS, HSTS, CSP.

---

## 6. Trazabilidad

- Tasks: `docs/tasks/auth-onboarding-v5/TASK-01..09`.
- ADRs: ADR-0041 (admin), ADR-0042 (cross-tenant/identity).
- Análisis: este documento.
- Knowledge transfer: `knowledge-transfer/08-identity-tenancy-and-guests.md`.
- Requirements: `docs/requirements.md` (US-00 + matriz de decisión).

---

## 7. Conclusión

El modelo es coherente en su núcleo. La evolución v5 (tenant explícito, global_users, invitaciones globales, atomización) está en progreso: esquemas y puertos creados, integración end-to-end pendiente. Prioridad: cerrar P0 (seguridad/coherencia) antes de avanzar en UX.