# VozLab — Tareas atómicas de login e identidad

Carpeta autocontenida para modelos pequeños. Cada archivo es un prompt independiente:
el ejecutor solo necesita leer los archivos que nombra cada tarea.

> Documentos rectores: `../01-explicacion-logins-y-ia.md` y `../02-tareas-para-modelo-pequeno.md`.
> Alcance: **solo login, identidad, invitaciones, índice global y auditoría**.
> Fuera de alcance: Extractor/Relator/Consolidador (bloque E y F2 de `02-...`).

## Status as of 2026-10-29 (reconciled with `docs/analysis/auth-onboarding-committee-review.md`)

- **A1–A8**: decisions recorded (ADR-0028, ADR-0029, ADR-0030, ADR-0031). ✅
- **B1–B9**: lab migrated from Keycloak to Zitadel (ADR-0030); Keycloak retained in `docker/identity-lab/`. B2/B3/B5/B8/B9 exist as lab assets (compose + README steps) but are NOT part of the product path or CI. The Zitadel smoke (B7) is covered by the real-login E2E (§6.5 of the committee review). B6: tenant from claims (ADR-0031) implemented.
- **C1–C7**: implemented (contract tests, `emailVerified` null, `external_identities`, search by identity, claim-based tenant resolution, `ExternalIdentity` type, `sessions_valid_after`). **C8 deferred** (tracked, not scheduled).
- **D1**: `tenant_identity_providers` table + repository + management endpoints implemented. ✅
- **D2**: login uses `kc_idp_hint` only; tenant resolved from token claims (ADR-0031). ✅
- **D3**: create/list/revoke implemented; **resend/rotate of the token is NOT** — re-issue works via revoke + create (accepted deviation).
- **D4**: design-only; documented in `01-explicacion-logins-y-ia.md` §11; NOT formalized in an ADR as the task asked. Open (low priority: nothing accepts institutional domains yet).
- **D5**: correlation-control rationale documented (§6.3 of `01-...`); no standalone test design. Open (doc-level).
- **D6–D8**: global identity tables + resolution implemented; `global_identity_tenants` is now written on every institutional login and every global redemption (committee P0-2, 2026-10-28). ✅
- **D9**: `RedeemInvitationAtomicUseCase` is the real mutation of the first login (committee B12, `f7f154b`). ✅
- **D10–D12**: memberships admin complete; `DrizzleAuditLog` append-only persistent (`membership_events` + `global_identity_events`); direct add by handle/globalUserId with `findGlobalTenantLink` (P0-3, 85ceb64; handle write fixed by B14). ✅
- **D13**: `backfill-global-identities.ts` (idempotent upsert + conflict reporting without aborting). ✅
- **D14**: `reconcile-router-tenants.ts` + `backfill-external-identities.ts`; the live `oidc_tenant_id` drift was reconciled 2026-10-29. ✅
- **F1**: ADR-0028 (amended by ADR-0030). ADR-0029, ADR-0030, ADR-0031 added. ✅
- **F4**: PII inventory and privacy notice are NOT created (only `knowledge-transfer/05-data-and-database.md` exists, which is technical, not the legal inventory). Open.

## Orden sugerido

1. **A1–A8** en paralelo (decisiones, no código).
2. **B1–B9** laboratorio local.
3. **C1–C8** cierre de riesgos de identidad.
4. **D1–D14** multi-institución e índice global.
5. **F1** ADR-0028 (identidad multi-institución, índice global y broker) y **F4** inventario de datos.

## Índice

### Bloque A — Decisiones
- A1 Sistema de acceso de la universidad
- A2 Broker de identidad
- A3 Índice global: alcance y privacidad
- A6 Ruta del laboratorio de identidad
- A7 Invitaciones y alta directa
- A8 Auditoría

> A4 y A5 (deduplicación y alcance del Extractor) se movieron a `../ai-worker-tasks/`.

### Bloque B — Laboratorio local
- B1 Compose del laboratorio
- B2 Directorio ligero con LLDAP
- B3 Dominio AD de prueba con Samba
- B4 Realm de Keycloak y cliente de VozLab
- B5 Federación del directorio en Keycloak
- B6 Claim `tid` y claims canónicos
- B7 Prueba de humo del laboratorio
- B8 Authentik (opcional)
- B9 SAML 2.0 entre dos realms

### Bloque C — Riesgos de identidad
- C1 Pruebas de contrato del adaptador OIDC
- C2 `email_verified` ausente
- C3 Tabla `auth.external_identities`
- C4 Búsqueda por identidad, no por correo
- C5 El login fija la institución
- C6 Tipo `ExternalIdentity`
- C7 Cerrar sesiones de cuenta desactivada
- C8 HMAC del subject (opcional)

### Bloque D — Multi-institución
- D1 Proveedores por institución en el router
- D2 Ruta de login por institución
- D3 Invitaciones por institución
- D4 Verificación de dominio por DNS
- D5 Prueba de correlación controlada
- D6 Índice global de identidades (M2a)
- D7 Vínculo global ↔ institución (M2b)
- D8 Resolver o crear la identidad global en el login
- D9 Canje de invitación en el primer login
- D10 Gestión de membresías por ADMIN
- D11 Auditoría append-only
- D12 Alta directa de identidades conocidas
- D13 Relleno de usuarios existentes
- D14 Reconciliación router ↔ instituciones

### Bloque F — Gobierno
- F1 ADR-0028
- F4 Inventario de datos personales y aviso de privacidad