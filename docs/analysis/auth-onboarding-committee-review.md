# Revisión de arquitectura: autenticación y onboarding (tenant / workspace)

Comité: arquitectura + seguridad + producto. Fecha: 2026-10-28 (v2, ampliada con preocupaciones del usuario).
Contexto: VozLab multi-tenant (router DB + una DB por tenant), Fastify API + SvelteKit PWA, OIDC (Zitadel), event join anónimo, workspaces con admin tenant/workspace, join requests, invitaciones email-bound (solo URL, sin envío de email).

---

## 0. Resumen ejecutivo

- El núcleo actual es **coherente**: OIDC como identidad, invitación como onboarding con rol, código de workspace como "dirección" (nunca llave), aprobación humana para privados.
- El principal problema de **coherencia** es que hay **demasiadas puertas de entrada** con identidades de calidad distinta y solapamientos; varias pueden reducirse.
- El principal problema de **seguridad** es que la puerta anónima del event join es demasiado permisiva y los códigos de workspace son estáticos/permanentes (solo rotan manualmente).
- Se propone: (a) códigos de workspace efímeros y revocables, (b) un rol `GUEST`/`MEMBER_LITE` para asistentes de evento, (c) tipificar workspaces por propósito (evento / público / privado), (d) consolidar flujos redundantes, (e) mantener invitaciones como URL pura sin servicio de email.

---

## 1. Inventario de flujos por emisor y propósito

| # | Flujo | Emisor | Propósito | Credencial | Resultado |
|---|-------|--------|-----------|------------|-----------|
| A | OIDC login | Usuario humano identificado | Entrar al tenant con identidad verificada | Código OIDC + state | Sesión + usuario + membresías existentes |
| B | Event join | Asistente anónimo | Participar en un evento sin fricción | Código de evento global | Usuario anónimo + membresía MEMBER (o GUEST) en workspace del evento |
| C | Descubrimiento público | Usuario autenticado sin workspace | Pedir acceso a workspace público | Ninguna | Solicitud PENDING (no grant) |
| D | Join request por código de workspace | Usuario autenticado | Pedir acceso a workspace privado | `join_code` (rotativo) | Solicitud PENDING |
| E | Invitación email-bound | Admin de workspace | Onboarding dirigido con rol | Token raw en URL | Sesión (OIDC) + membresía con rol, tras redención |
| F | Alta directa por admin | Admin de workspace | Añadir usuario ya en tenant a un workspace | Email del usuario | Membresía ACTIVE |
| G | Aprobación de join request | Admin de workspace | Convertir solicitud PENDING en membresía | — | Membresía ACTIVE |

Roles: tenant ADMIN (`system_role='ADMIN'`) gestiona todo el tenant; workspace ADMIN (`workspace_memberships.role='ADMIN'` ACTIVE) gestiona su workspace. Roles leídos de DB en cada request.

---

## 2. Explicación clara de los flujos confusos

### 2.1 "Alta directa por admin" (F)
Un administrador de workspace añade a un usuario que **ya existe en el tenant** (porque antes hizo OIDC) directamente como miembro ACTIVE, asignándole un rol. No hay solicitud ni aprobación intermedia: el admin decide. Es el flujo más simple y directo para onboarding de personas conocidas.

- Cuándo usar: el admin conoce al usuario y quiere darle acceso inmediato con un rol concreto.
- Limitación: el usuario debe haber entrado al tenant antes (OIDC). No crea identidades nuevas.

### 2.2 "Aprobación de join request" (G)
Un usuario (autenticado) pidió acceso a un workspace (flujo C o D) y quedó en estado PENDING. El admin revisa la bandeja de solicitudes y aprueba o rechaza. Al aprobar, se crea la membresía ACTIVE.

- Cuándo usar: workspaces privados donde el admin quiere controlar quién entra.
- Diferencia con F: aquí el usuario inicia; en F el admin inicia.

### 2.3 Relación entre F y G
Son dos caras del mismo concepto (crear membresía) con distinto iniciador. Se pueden **consolidar conceptualmente**: "crear membresía" con dos variantes (admin-initiated vs request-approved). A nivel de código, mantener separados por auditoría, pero la UI puede unificarlos en una sola pantalla de "Miembros".

---

## 3. Códigos: evento vs workspace join code

### 3.1 Estado actual
- **Código de evento (B)**: global, en router DB, efímero (expira, capacidad limitada), se consume al entrar. Bien.
- **Código de workspace (D)**: estático en `workspaces.join_code`, solo rota manualmente por el admin. **Problema**: permanente; si se filtra, cualquiera puede solicitar acceso indefinidamente hasta que el admin rote.

### 3.2 Propuesta: códigos de workspace efímeros y revocables
Convertir el join code en un recurso gestionable, similar a los códigos de evento pero a nivel workspace:
- Permitir **múltiples códigos activos** por workspace, cada uno con: etiqueta (ej. "Asamblea marzo"), expiración (TTL), capacidad máxima (opcional), estado (activo/revocado).
- El admin puede crear, editar (TTL/capacidad/etiqueta), revocar individualmente o rotar todos.
- Un código revocado/expirado deja de enrutar solicitudes (devuelve `ERR_WORKSPACE_NOT_FOUND` o un error específico).
- Mantener un código "por defecto" de larga duración para el caso simple, pero permitir códigos efímeros para eventos.

**Ventaja**: blindaje del workspace — un código filtrado tiene vida corta y capacidad limitada; el admin puede revocarlo sin afectar otros códigos.

**Costo**: nueva tabla `workspace_join_codes` (workspace_id, code_hash, label, expires_at, max_uses, used_count, revoked_at). Migración.

### 3.3 ¿Dónde viven los códigos? (router vs tenant DB)

- **Códigos de evento**: viven en router DB porque el event join ocurre **antes** de resolver el tenant (el código es la única credencial; el tenant se deriva del código). Correcto, no mover.
- **Códigos de workspace e invitaciones**: son **workspace-scoped** y el workspace vive en tenant DB. Viven ahí. No duplicar en router DB.
- **Regla**: un código vive en la DB donde se resuelve su alcance. Si el código identifica un tenant/workspace antes de autenticación, va a router DB; si requiere sesión (tenant ya resuelto), va a tenant DB.

No hay duplicación real: cada código tiene un alcance distinto.

---

## 4. Invitación por email sin servicio de email

### 4.1 Estado actual
`CreateInvitationUseCase` crea la invitación y devuelve `{ invitation, url }` donde `url = ${WEB_ORIGIN}/login?invitation=<token>`. El admin copia el enlace y lo envía por el canal que quiera. **No hay envío de email.** Esto es exactamente lo que el usuario quiere.

### 4.2 Recomendaciones
- Mantener así: la invitación es un **artefacto generable**, no un envío. El admin es responsable de la distribución.
- Añadir en la UI: botón "Copiar enlace", mostrar expiración, estado (PENDING/USED/EXPIRED/REVOKED), y la posibilidad de revocar/regenerar.
- No implementar servicio de email ahora; si en el futuro se quiere, se añade como un adaptador opcional sobre el mismo `CreateInvitationUseCase` (el use case no cambia).
- Añadir recordatorio visual de invitaciones próximas a expirar (PENDING con `expiresAt` < 24h).

---

## 5. Usuarios temporales / guest y control de acceso por tipo de workspace

### 5.1 Preocupación del usuario
Los asistentes a eventos se autentican con información del dispositivo (anónimos, efímeros). Algunos workspaces no deben permitirles.

### 5.2 Propuesta: rol `GUEST` (o `MEMBER_LITE`)
Añadir un rol `GUEST` para usuarios creados por event join:
- Permisos: leer el workspace del evento, participar en discusiones/votos del evento.
- Sin permisos: solicitar acceso a otros workspaces, crear propuestas sensibles, administrar, crear nodos en workspaces no-evento.
- Marcado en `auth.users` con `is_anonymous=true` (o derivado del tipo de usuario) y rol GUEST en la membresía.

### 5.3 Tipificación de workspaces
Añadir `workspaces.kind` (o `purpose`):
- `EVENT`: creado para un evento; admite event join; los miembros GUEST solo ven este workspace.
- `PUBLIC`: descubrible, cualquier usuario autenticado puede solicitar acceso.
- `PRIVATE`: solo por invitación o código (solicitud).

Reglas de acceso:
- Un usuario GUEST solo puede ser miembro de workspaces EVENT.
- Un usuario real (OIDC) puede ser miembro de cualquier tipo.
- Un workspace EVENT no aparece en descubrimiento público para usuarios reales (o sí, como "eventos abiertos").

Esto resuelve la preocupación: los flujos de entrada a workspaces sensibles quedan vedados a guests.

---

## 6. Consolidación de flujos (reducir redundancias)

### 6.1 Solapamientos detectados
- (C) descubrimiento y (D) código de workspace hacen lo mismo (solicitud PENDING) con distinta credencial.
- (F) alta directa y (G) aprobación crean membresía con distinto iniciador.
- (E) invitación y (F) alta directa ambos onboardean con rol; la invitación requiere OIDC previo del invitado, F también.

### 6.2 Propuesta de consolidación
Reducir a **tres puertas de entrada** por propósito:

1. **Identidad (OIDC)** — la única forma de crear un usuario real. Todo lo demás asume un usuario existente (excepto event join).
2. **Acceso a workspace** — un solo flujo "solicitar acceso" con dos variantes de credencial (id público o código). Ya está casi así (`RequestWorkspaceAccessUseCase`).
3. **Onboarding con rol** — invitación (URL) como método único; la alta directa se convierte en "invitación auto-redimida por admin" o se elimina a favor de invitaciones. Mantener alta directa solo como atajo para usuarios ya en tenant.

Eliminar/reducir:
- Event join se mantiene pero acotado a workspaces EVENT y rol GUEST.
- Join request por código y por descubrimiento se unifican en un solo endpoint (ya lo están).
- Alta directa y aprobación se unifican en la UI de "Miembros" (backend separado por auditoría).

### 6.3 Flujos a descartar o no implementar
- Magic link / passwordless: no implementar ahora (invitación por URL ya cubre el caso).
- SCIM/provisioning: no implementar (fuera de alcance).
- Contraseñas propias: no implementar (OIDC cubre).
- Códigos que otorgan acceso directo: **nunca**.

---

## 7. Lo que se está obviando (tenant auth y otros)

1. **Autenticación contra tenant**: el tenant se resuelve por claims OIDC (`hd`/`tid`/org). No hay un paso explícito de "seleccionar tenant" para usuarios multi-tenant. Si un usuario pertenece a varios tenants, el flujo actual no lo soporta bien. Considerar: si un email pertenece a varios tenants, mostrar selector post-login.
2. **Verificación de email**: la invitación requiere `emailVerified=true`. Si el IdP no lo provee, la invitación es inredimible. Documentar que el IdP debe proveer email verificado.
3. **Revocación de sesión al cambiar rol**: no hay invalidación inmediata de access token. Recomendado: acortar TTL + invalidar refresh family al suspender.
4. **Auditoría**: no hay tabla de auditoría de acciones admin.
5. **Rate limiting específico** por actor en acciones admin.
6. **Limpieza de invitaciones expiradas** y de usuarios anónimos inactivos.
7. **CORS/CSRF**: la PWA usa Bearer + cookie HttpOnly; verificar que `/auth/refresh` esté protegido contra CSRF (SameSite cookie).

---

## 8. Casos de uso / historias de usuario a cubrir

### Usuarios reales (OIDC)
- US-A: Como usuario institucional, quiero entrar al tenant con mi cuenta corporativa.
- US-B: Como usuario sin workspace, quiero descubrir workspaces públicos y solicitar acceso.
- US-C: Como usuario con código, quiero solicitar acceso a un workspace privado.
- US-D: Como invitado, quiero redimir una invitación y obtener mi membresía con rol.

### Asistentes de evento (GUEST)
- US-E: Como asistente, quiero unirme a un evento con un código sin crear cuenta.
- US-F: Como asistente, solo quiero ver/participar en el workspace del evento.

### Administradores
- US-G: Como admin de workspace, quiero crear códigos de acceso efímeros con expiración y capacidad.
- US-H: Como admin, quiero revocar un código filtrado sin afectar otros.
- US-I: Como admin, quiero generar un enlace de invitación y copiarlo (sin envío de email).
- US-J: Como admin, quiero aprobar/rechazar solicitudes de acceso.
- US-K: Como admin, quiero añadir directamente a un usuario del tenant.
- US-L: Como admin, quiero suspender/reactivar/eliminar miembros sin poder quedarme sin admins.
- US-M: Como tenant admin, quiero crear workspaces (provisionando ontología base) y gestionar usuarios.

### Seguridad
- US-N: Como sistema, quiero que un código de workspace nunca otorgue acceso directo.
- US-O: Como sistema, quiero que un guest no pueda acceder a workspaces no-evento.
- US-P: Como sistema, quiero que suspender a un usuario invalide su sesión.

---

## 9. Opciones y mejores prácticas acotadas al producto

| Decisión | Opción recomendada | Alternativa descartada | Motivo |
|----------|-------------------|----------------------|--------|
| Códigos de workspace | Efímeros, múltiples, revocables (P0) | Estático permanente | Blindaje ante filtración |
| Invitación | URL pura, sin email service | Envío automático de email | Menos infraestructura, admin controla distribución |
| Guest | Rol GUEST acotado a workspaces EVENT | Permitir todo a anónimos | Menor privilegio |
| Tipos de workspace | EVENT / PUBLIC / PRIVATE | Un solo tipo | Políticas de acceso claras |
| Consolidación | 3 puertas: identidad, acceso, onboarding con rol | 7 flujos independientes | Menos complejidad, menos bugs |
| Multi-tenant | Resolver por claims, añadir selector si varios | Forzar un tenant | Flexibilidad futura |
| Sesión | TTL corto + invalidar refresh family al suspender | Solo TTL | Revocación efectiva |

---

## 10. Lo que ya está bien (no tocar)

- Roles leídos de DB en cada request.
- Workspace mismatch → 404.
- Invitación: email-bound, single-use, TTL, hash at rest, revoke-previous, redención estricta, race-safe.
- Código de workspace solo enruta solicitud.
- Protección del último admin.
- Tenant admin vs workspace admin separados.
- Eventos publicados after-commit best-effort.
- Invitación como URL pura (sin email service) — ya implementado.

---

## 11. Recomendaciones priorizadas

**P0 (seguridad/coherencia):**
1. Códigos de workspace efímeros y revocables (nueva tabla + UI).
2. Acotar event join a workspaces EVENT + rol GUEST.
3. Añadir `workspaces.kind` (EVENT/PUBLIC/PRIVATE) y `users.is_anonymous`.
4. Rate limit dedicado por actor en acciones admin.

**P1 (operación):**
5. Invalidar refresh family al suspender.
6. Auditoría de acciones admin.
7. Limpieza de invitaciones expiradas y guests inactivos.
8. Selector de tenant si el usuario pertenece a varios.

**P2 (producto):**
9. Consolidar UI de "Miembros" unificando alta directa y aprobación.
10. Documentar matriz de decisión en requirements.md.
11. Event join: exponer en admin conteo de usos y rotación del código de evento.

---

## 12. Conclusión del comité

El modelo actual es **coherente en su núcleo** pero **demasiado permisivo en la puerta anónima** y **demasiado estático en los códigos de workspace**. Se recomienda implementar P0 (códigos efímeros, guest acotado, tipificación de workspaces) antes de exponer workspaces sensibles. No implementar contraseñas propias, magic links ni envío de email por ahora; la invitación como URL pura es suficiente y más simple. Consolidar flujos redundantes para reducir superficie de ataque y complejidad.