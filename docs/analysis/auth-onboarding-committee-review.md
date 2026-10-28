# Revisión de arquitectura: autenticación y onboarding (tenant / workspace)

Comité: arquitectura + seguridad + producto. Fecha: 2026-10-28 (v3, con preocupaciones adicionales del usuario).
Contexto: VozLab multi-tenant (router DB + una DB por tenant), Fastify API + SvelteKit PWA, OIDC (Zitadel), event join anónimo, workspaces con admin tenant/workspace, join requests, invitaciones email-bound (solo URL, sin envío de email).

---

## 0. Resumen ejecutivo

- El núcleo actual es **coherente**: OIDC como identidad, invitación como onboarding con rol, código de workspace como "dirección" (nunca llave), aprobación humana para privados.
- **Problemas de coherencia**: demasiadas puertas de entrada con identidades de calidad distinta; solapamientos; alta directa por admin usa email (no ideal).
- **Problemas de seguridad**: puerta anónima del event join demasiado permisiva; códigos de workspace estáticos/permanentes; invitación URL compartible.
- **Decisiones nuevas propuestas**:
  - Códigos de workspace efímeros y revocables (nueva tabla) — aprobado por el usuario.
  - `workspaces.kind` (EVENT/PUBLIC/PRIVATE) — aprobado.
  - Rol `GUEST` acotado (sí puede crear propuestas PENDING) — aprobado.
  - Alta directa por admin debe dejar de usar email; usar identidad global o handle único por tenant.
  - Un usuario puede tener múltiples membresías y múltiples roles por workspace (unión, sin personificación).
  - Códigos de acceso separados: tenant vs workspace, con auto-aprobación configurable.
  - Evento: QR con ambos códigos (tenant + workspace) en un solo paso.
  - Invitación: URL/QR compartible, rol asignado al redimir; token opaco + email verificado por IdP; membresía creada server-side.
  - **Cross-tenant**: invitaciones globales (router DB) para colaboradores externos/cross-IdP; selector de tenant post-login; social logins en Zitadel.

---

## 1. Inventario de flujos por emisor y propósito

| # | Flujo | Emisor | Propósito | Credencial | Resultado |
|---|-------|--------|-----------|------------|-----------|
| A | OIDC login | Usuario humano identificado | Entrar al tenant con identidad verificada | Código OIDC + state | Sesión + usuario + membresías |
| B | Event join | Asistente anónimo | Participar en evento sin fricción | Código de evento global | Usuario anónimo + membresía GUEST en workspace EVENT |
| C | Descubrimiento público | Usuario autenticado | Pedir acceso a workspace público | Ninguna | Solicitud PENDING |
| D | Join request por código | Usuario autenticado | Pedir acceso a workspace privado | `join_code` (rotativo) | Solicitud PENDING |
| E | Invitación email-bound | Admin de workspace | Onboarding dirigido con rol | Token raw en URL/QR | Sesión (OIDC) + membresía con rol |
| F | Alta directa por admin | Admin de workspace | Añadir usuario ya en tenant | Identidad global o handle | Membresía ACTIVE |
| G | Aprobación de join request | Admin de workspace | Convertir PENDING en ACTIVE | — | Membresía ACTIVE |

Roles: tenant ADMIN (`system_role='ADMIN'`) gestiona todo el tenant; workspace ADMIN (`workspace_memberships.role='ADMIN'` ACTIVE) gestiona su workspace. Roles leídos de DB en cada request.

---

## 2. Explicación clara de los flujos confusos

### 2.1 "Alta directa por admin" (F)
Un administrador añade a un usuario que **ya existe en el tenant** directamente como miembro ACTIVE con un rol. El admin decide, sin solicitud intermedia.

**Problema actual**: usa `email` como identificador. Pero:
- El email no es un identificador único por IdP (mismo email en varios IdPs).
- Aunque se almacena (`auth.users.email`), no es confiable como clave de búsqueda.

**Solución propuesta**: usar la **identidad global** (`global_identities` en router DB, clave única `(issuer, subject)`) o un **handle único por tenant** (campo `auth.users.handle`, único por tenant, editable por el usuario). El admin busca por handle o por (issuer, subject) resuelto, no por email. El email queda como dato informativo, no como clave.

### 2.2 "Aprobación de join request" (G)
Un usuario pidió acceso (C o D) y quedó PENDING. El admin aprueba o rechaza. Al aprobar, se crea la membresía ACTIVE.

### 2.3 Relación F y G
Dos iniciadores del mismo resultado (crear membresía). Consolidar en UI como "Miembros"; backend separado por auditoría.

---

## 3. Membresías y roles múltiples

### 3.1 Estado actual
- Un usuario puede tener **múltiples membresías** a **múltiples workspaces** (tabla `workspace_memberships` es N:M por user/workspace).
- Pero solo **un rol por (workspace, user)** (una fila por par).

### 3.2 Propuesta: múltiples roles por workspace (esquema, sin personificación)
Cambiar el modelo para que un usuario pueda tener **varios roles simultáneos** en el mismo workspace:
- Esquema: `workspace_memberships` con PK `(workspace_id, user_id, role)` — permite varias filas por par, una por rol. **No** usar una columna con lista de roles (evita parsing y queries frágiles).
- Los admins asignan y retiran roles individualmente (alta/baja de filas).

**Implicaciones**:
- Las verificaciones de seguridad deben comprobar **todos los roles** del usuario en ese workspace (unión), no solo uno. Un usuario con roles `MEMBER` + `MODERATOR` tiene los permisos de ambos.
- La UI **no** tendrá selector de personificación: solo muestra los roles que el usuario tiene ("tus roles: MEMBER, MODERATOR"). El backend evalúa la unión de todos los roles activos.
- Evita el problema de "quedar casado con un solo rol".

**Recomendación**: modelo de unión (todos los roles activos cuentan). Sin personificación.

---

## 4. Códigos de acceso: tenant vs workspace

### 4.1 Pregunta del usuario
¿Dividir responsabilidades? ¿Uno para entrar al tenant y otro para el workspace (requiriendo estar en el tenant)? ¿Ambos en solicitud pendiente? ¿Auto-aprobación para eventos?

### 4.2 Propuesta

**Dos niveles de código, con auto-aprobación configurable:**

| Código | Alcance | Requiere | Auto-aprobación | Cuándo |
|--------|---------|----------|-----------------|--------|
| **Código de tenant (evento)** | Router DB, global | Ninguna (anónimo) | Sí (crea usuario + membresía) | Eventos públicos de baja sensibilidad |
| **Código de workspace** | Tenant DB, por workspace | Sesión (usuario en tenant) | Configurable por workspace (`autoApproveJoinCode`) | Workspaces con código compartido |

**Reglas**:
- Si `autoApproveJoinCode=true` (ej. workspace de evento), el código de workspace crea la membresía directamente (sin PENDING).
- Si `autoApproveJoinCode=false` (default para privados), el código crea una solicitud PENDING (como hoy).
- El tenant admin puede configurar `autoApproveJoinCode` por workspace.
- Un código de workspace solo funciona para usuarios que ya tienen sesión en el tenant.

**Para eventos**: el QR/enlace puede contener **ambos códigos** (tenant + workspace) y pasarlos en un solo paso:
1. El cliente primero canjea el código de tenant (crea usuario anónimo + sesión).
2. Luego canjea el código de workspace (crea membresía, auto-aprobada si el workspace es EVENT).
3. Todo en una sola interacción del usuario ("escanear QR → entrar").

Esto es coherente y reduce fricción sin sacrificar control.

### 4.3 Códigos efímeros de workspace
Nueva tabla `workspace_join_codes` (aprobada por el usuario):
- `id, workspace_id, code_hash, label, expires_at, max_uses, used_count, auto_approve, revoked_at, created_by, created_at`
- El admin crea/edita/revoca individualmente.
- Múltiples códigos activos por workspace.

---

## 5. Invitación: URL/QR y seguridad

### 5.1 Cómo se asigna la membresía (tenant + workspace + rol)

Pregunta: ¿cómo se asigna la membresía al tenant y al workspace si OIDC se encarga de la identificación?

Respuesta: el endpoint `CompleteOidcLoginUseCase` lo hace **automáticamente** en una transacción, tras verificar el token:

1. El usuario hace clic en la URL de invitación → si no hay sesión, el navegador va a `/auth/login?invitation=<token>` (la API).
2. La API (StartOidcLoginUseCase) guarda el token en el **state store server-side** (Redis/memoria, asociado a un `state` opaco) y redirige al IdP con ese `state`. El IdP no ve el token.
3. El usuario se autentica en el IdP (universidad X). El IdP devuelve un código al callback de la API.
4. La API (CompleteOidcLoginUseCase) intercambia el código por un ID token, extrae `email` + `emailVerified`.
5. **Redención de la invitación** (en transacción):
   - Busca la invitación por hash del token en tenant DB.
   - Verifica: PENDING, no expirada, no usada, email coincide y verificado.
   - Crea la membresía en `workspace_memberships` con el `workspaceId` y `role` guardados en la invitación.
   - Marca la invitación como ACCEPTED (single-use).
6. La membresía al **tenant** ya existe implícitamente: el usuario se crea en `auth.users` del tenant si no existía (o se reutiliza por global identity). No hay una tabla de "membresía a tenant" separada — pertenecer al tenant = tener fila en `auth.users` de ese tenant.

**Los 3 datos (tenant, workspace, rol) NO están en el token de invitación** — están en la fila de la invitación en la DB del tenant. El token solo es una clave opaca para encontrar esa fila. Esto es más seguro: el token no revela a qué workspace/rol corresponde.

**¿Puede crear ambas membresías si lo invité al tenant de la universidad Y?**
- El tenant se resuelve por los claims del IdP (hd/tid/org). Si el usuario se autentica con el IdP de la universidad Y, el tenant Y se resuelve automáticamente. La invitación vive en la DB del tenant Y (porque el admin que la creó pertenece a Y). Por lo tanto, todo cuadra: el usuario entra a Y, la invitación se busca en la DB de Y, y se crea la membresía al workspace de Y con el rol asignado.
- Si el usuario usa un IdP distinto (universidad X), el tenant resuelto será X, y la invitación de Y no se encontrará (tenant mismatch) → error `ERR_INVITATION_INVALID`. Correcto por seguridad.

### 5.2 Seguridad del token: quién puede verlo

**El token de invitación** (`/login?invitation=<token>`):
- Es un string opaco (random, 32+ bytes). Solo su SHA-256 se almacena.
- Viaja en la URL → queda en historial del navegador, logs del servidor y referrers. Mitigación: single-use + TTL 72h + email-bound.
- **Quién puede verlo en tránsito**: cualquiera con acceso a la red entre el navegador y el servidor, si no hay HTTPS. Por eso **HTTPS es obligatorio** en producción. Con HTTPS, solo el navegador y el servidor lo ven.
- El token NO está firmado ni cifrado por sí mismo — su seguridad reside en ser opaco y de un solo uso.

**El state OIDC** (donde se guarda el token durante el redirect al IdP):
- Fastify/OIDC state store lo guarda server-side (Redis o memoria), asociado a un `state` param opaco en la URL del IdP.
- El IdP **no** ve el token de invitación; solo ve el `state` opaco.
- Al volver del IdP, la API recupera el state (incluyendo el invitation token) por el `state` param.

**El ID token del IdP** (JWT):
- Lo emite el IdP, firmado con su clave privada (RS256). La API lo verifica con la clave pública del IdP (JWKS).
- Contiene: `sub` (subject único del usuario en ese IdP), `email`, `email_verified`, `name`, `hd`/`tid`/org (tenant).
- **Quién puede verlo**: solo la API (lo recibe del IdP en el back-channel token exchange). El navegador nunca lo ve. El usuario no puede leerlo directamente.
- **Quién puede falsificarlo**: nadie sin la clave privada del IdP. La firma lo protege.
- **En tránsito**: HTTPS entre API e IdP.

**El access token de VozLab** (JWT propio):
- Lo emite la API, firmado con `JWT_SECRET` (HS256) o clave privada.
- Contiene: `userId`, `tenantKey`, `authorHash`. **No** contiene email, workspace ni roles (se leen de DB).
- Vive en memoria del navegador (no en cookie). TTL corto.
- **Quién puede verlo**: el navegador lo tiene en memoria; con XSS un atacante lo roba. Mitigación: CSP estricta, no persistir en localStorage.

**El refresh token**:
- Opaco, hasheado en DB. Vive en cookie HttpOnly, Secure, SameSite. El JS del navegador no puede leerlo.

### 5.3 ¿Es riesgoso que un usuario malicioso use la URL?
- El token es opaco (SHA-256 hash en reposo), single-use, TTL 72h.
- La redención requiere que el email del IdP coincida exactamente con el email invitado y esté verificado.
- Un atacante que obtenga la URL no puede redimirla a menos que controle el email invitado (y el IdP lo verifique).
- **Riesgo residual**: si el email invitado es comprometido, el atacante redime. Mitigación: TTL corto, single-use, revocación por admin, auditoría.

**¿Para qué usuarios es?** Para cualquier persona con email conocido a la que el admin quiere dar un rol específico. El rol se asigna de una vez al redimir.

**¿Puede ser QR?** Sí, simplemente codificar la URL en un QR. No cambia la seguridad.

---

## 6. GUEST: restricciones claras

### 6.1 Qué puede hacer un GUEST
- Leer el workspace EVENT del que es miembro.
- Participar en discusiones y votos de ese workspace.
- Ver el grafo del evento.

### 6.2 Qué NO puede hacer un GUEST
- Solicitar acceso a otros workspaces (ni públicos ni por código).
- Crear workspaces.
- Administrar nada.
- Ser invitado a workspaces no-EVENT con rol superior sin pasar por OIDC primero.

**Propuestas**: un GUEST **sí puede crear** propuestas de corrección/fusión (CorrectionProposal, MergeProposal). Todas quedan en PENDING y son el foco principal de las funcionalidades a mostrar/pronar. La aprobación sigue requiriendo un admin/moderador. El GUEST también puede votar (con peso estándar) en las propuestas de su workspace EVENT. Lo que NO puede es auto-aplicar ni aprobar.

### 6.3 Promoción de GUEST a MEMBER
Un admin puede "promover" a un guest cambiándole el rol a MEMBER (requiere que el usuario haya verificado identidad vía OIDC). Si el guest nunca hizo OIDC, la promoción requiere que primero complete OIDC.

---

## 7. Tipificación de workspaces (aprobado)

`workspaces.kind`: `EVENT` | `PUBLIC` | `PRIVATE`.

| kind | Descubrible | Event join | Código de workspace | Invitación | Join request |
|------|-------------|------------|---------------------|------------|--------------|
| EVENT | No (o solo eventos activos) | Sí | Auto-aprobado | Sí | No aplica |
| PUBLIC | Sí | No | Sí (PENDING por defecto) | Sí | Sí |
| PRIVATE | No | No | Sí (PENDING por defecto) | Sí | Sí (solo por código) |

---

## 8. Dónde viven los códigos (resumen)

- **Código de tenant/evento**: router DB (`event_codes`), global, pre-autenticación.
- **Código de workspace**: tenant DB (`workspace_join_codes`), post-sesión.
- **Invitación**: tenant DB (`invitations`), post-sesión (redención tras OIDC).
- **Regla**: el código vive donde se resuelve su alcance.

---

## 9. Consolidación de flujos

Reducir de 7 a **3 puertas** + variantes:

1. **Identidad (OIDC)** — única forma de crear usuario real.
2. **Acceso a workspace** — un flujo con credencial variable (id público / código) y auto-aprobación configurable.
3. **Onboarding con rol** — invitación (URL/QR) como método único; alta directa se convierte en atajo admin.

Event join se mantiene pero acotado a EVENT + GUEST.

**Descartar**: magic link, SCIM, contraseñas propias, códigos que otorguen acceso directo.

---

## 10. Lo que se está obviando

1. Multi-tenant: selector si el usuario pertenece a varios tenants.
2. Verificación de email por IdP (requerida para invitaciones).
3. Revocación de sesión al suspender (invalidar refresh family).
4. Auditoría de acciones admin.
5. Rate limiting específico por actor.
6. Limpieza de invitaciones expiradas y guests inactivos.
7. CSRF en `/auth/refresh` (SameSite cookie).
8. Unicidad de handle por tenant.
9. **Membresía al tenant es implícita** (fila en `auth.users` del tenant), no hay tabla separada. La invitación crea la membresía al workspace, no al tenant.
10. **El token de invitación no contiene datos sensibles** (tenant/workspace/rol); solo es clave para buscar la fila en DB. El ID token del IdP se verifica por firma (RS256 + JWKS) en el back-channel.

---

## 11. Casos de uso / historias de usuario

### Usuarios reales (OIDC)
- US-A: Entrar al tenant con cuenta corporativa.
- US-B: Descubrir workspaces públicos y solicitar acceso.
- US-C: Solicitar acceso a workspace privado con código.
- US-D: Redimir invitación y obtener membresía con rol.

### Asistentes de evento (GUEST)
- US-E: Unirse a evento con QR (tenant + workspace en un paso).
- US-F: Solo ver/participar en workspace EVENT.

### Administradores
- US-G: Crear códigos de workspace efímeros con TTL/capacidad/auto-aprobación.
- US-H: Revocar código filtrado.
- US-I: Generar enlace/QR de invitación y copiarlo.
- US-J: Aprobar/rechazar solicitudes.
- US-K: Añadir usuario por handle/identidad global.
- US-L: Suspender/reactivar/eliminar miembros (sin quedarse sin admins).
- US-M: Crear workspaces (provisionando ontología base).

### Seguridad
- US-N: Código de workspace nunca otorga acceso directo (salvo auto-aprobación configurada).
- US-O: Guest no accede a workspaces no-EVENT.
- US-P: Suspender invalida sesión.
- US-Q: Múltiples roles por workspace, verificación por unión.

### Cross-tenant y colaboradores externos
- US-R: Como admin, invitar a un colaborador externo (gmail) a un workspace.
- US-S: Como colaborador externo, usar cuenta Google personal para redimir invitación.
- US-T: Como usuario con múltiples tenants, seleccionar a cuál entrar tras login.
- US-U: Como admin, invitar a alguien de otra universidad (otro IdP).
- US-V: Como sistema, resolver tenant desde la invitación cuando el IdP no lo provee.

---

## 12. Opciones y mejores prácticas

| Decisión | Recomendada | Descartada | Motivo |
|----------|-------------|------------|--------|
| Alta directa por admin | Por handle/identidad global | Por email | Email no es clave única por IdP |
| Roles por workspace | Unión de todos los roles activos | Un solo rol | Evita "casarse" con un rol |
| Códigos de workspace | Efímeros, revocables, auto-aprobación configurable | Estático permanente | Blindaje + flexibilidad |
| Evento | QR con ambos códigos, auto-aprobado | Solo código de tenant | Un paso, baja fricción |
| Invitación | URL/QR, rol asignado al redimir, sin email service | Envío automático | Menos infra, admin controla |
| Guest | Rol GUEST acotado a EVENT | Anónimo con todo | Menor privilegio |
| Tipos de workspace | EVENT/PUBLIC/PRIVATE | Uno solo | Políticas claras |

---

## 13. Lo que ya está bien (no tocar)

- Roles leídos de DB en cada request.
- Workspace mismatch → 404.
- Invitación: email-bound, single-use, TTL, hash at rest, revoke-previous, redención estricta, race-safe.
- Código de workspace solo enruta solicitud (salvo auto-aprobación configurada).
- Protección del último admin.
- Tenant admin vs workspace admin separados.
- Eventos publicados after-commit best-effort.
- Invitación como URL pura.
- `workspaces.join_code` rotativo (base para efímeros).

---

## 14. Recomendaciones priorizadas

**P0 (seguridad/coherencia):**
1. Alta directa por admin: dejar de usar email, usar handle/identidad global.
2. Múltiples roles por workspace (esquema + verificación por unión, sin personificación en UI).
3. Códigos de workspace efímeros y revocables (nueva tabla).
4. `workspaces.kind` (EVENT/PUBLIC/PRIVATE) + `users.is_anonymous`.
5. Rol GUEST acotado.
6. Auto-aprobación configurable por workspace.
7. **Invitaciones globales** (token en router DB) para cross-IdP/externos.

**P1 (operación):**
8. Invalidar refresh family al suspender.
9. Auditoría de acciones admin.
10. Rate limit dedicado por actor.
11. Selector de tenant post-login (usuarios multi-tenant).
12. Habilitar social logins en Zitadel.
13. Limpieza de invitaciones expiradas y guests inactivos.

**P2 (producto):**
12. QR con ambos códigos para eventos.
13. Consolidar UI de "Miembros".
14. Documentar matriz de decisión en requirements.md.
15. Event join: exponer en admin conteo de usos y rotación.

---

## 15. Cross-tenant access y colaboradores externos

### 15.1 Preocupaciones del usuario
- La invitación actual solo cubre miembros del mismo IdP/tenant que el admin.
- Deja fuera a colaboradores que no están en el IdP o que quieren usar otro correo (de otra universidad o personal).
- El tenant se define implícitamente para algunos flujos; el usuario quiere saber cuándo/cómo/dónde debe indicarse explícitamente.
- Proponer la misma estrategia que los códigos (independientes por nivel) pero para usuarios: permitir cross-multi-tenant access y colaboradores externos (gmail/outlook/social).

### 15.2 Análisis

**Estado actual del modelo de identidad:**
- `global_identities` (router DB) ya es el ancla cross-tenant: clave única `(issuer, subject)`.
- `global_identity_tenants` ya permite que una identidad global pertenezca a **múltiples tenants**.
- Pero el tenant se resuelve por claims del IdP (hd/tid/org). Si el IdP es genérico (Google personal, social), no hay claim de tenant → no se puede resolver el tenant. Bloqueo para colaboradores externos.

**Problema de la invitación cross-tenant:**
- La invitación vive en la DB del tenant (porque el admin que la crea pertenece a ese tenant).
- Para encontrar la invitación, hay que saber en qué tenant DB buscar → chicken-and-egg si el tenant se resuelve por el IdP.
- Por eso hoy solo funciona cuando el invitado usa el mismo IdP/tenant que el admin.

### 15.3 Opciones (A y B preferidas; conciliar en mixta)

**Opción A — Invitación global (router DB):**
- Crear un registro mínimo de invitación en router DB: `(token_hash, tenant_id, workspace_id, role, email, expires_at, ...)`.
- El token resuelve el tenant antes de OIDC. Tras OIDC, se redime en el tenant DB.
- Permite invitar a cualquier persona con cualquier IdP (el tenant viene de la invitación, no del IdP).
- Cross-tenant: un usuario puede tener invitaciones a múltiples tenants; cada una se redime en su tenant.

**Opción B — Selector de tenant post-login:**
- El usuario se autentica con cualquier IdP. Si tiene múltiples tenants vinculados, se le muestra un selector.
- Si tiene uno, se selecciona automáticamente.
- Para colaboradores externos sin tenant vinculado, se requiere una invitación (Opción A) o un tenant por defecto.

**Opción mixta (A + B) — RECOMENDADA:**
- Invitación global (A) para resolver tenant en flujos cross-IdP/externos.
- Selector de tenant (B) para usuarios con múltiples tenants vinculados.
- Ambas conviven: la invitación provee el tenant cuando no hay sesión; el selector provee el tenant cuando hay múltiples.
- Para usuarios con un solo tenant, selección automática (sin fricción).

**Descartadas:**
- Opción C (tenant personal): complica aislamiento.
- Opción D (tenant en state OIDC): frágil si el state se pierde.

### 15.4 Cuándo indicar el tenant explícitamente

| Flujo | Tenant implícito | Tenant explícito |
|-------|-----------------|------------------|
| Event join | Sí (del código de evento) | No |
| Invitación (mismo IdP) | Sí (del IdP) | No |
| Invitación (cross-IdP/externo) | No | Sí (de la invitación en router DB) |
| Join request por código | Sí (del código de workspace, que vive en tenant DB → requiere sesión) | No (ya tiene sesión) |
| Descubrimiento público | Sí (de la sesión) | No |
| Admin (tenant admin) | Sí (de la sesión) | Selector si múltiples tenants |
| Usuario con múltiples tenants | No | Selector post-login |

**Regla**: el tenant es implícito cuando hay una credencial que lo identifica (código, invitación, sesión única). Es explícito cuando el usuario tiene múltiples tenants o cuando la invitación es cross-IdP.

### 15.5 Colaboradores externos (gmail/outlook/social)

- **IdP genérico**: Zitadel puede brokerizar Google (personal), Microsoft (personal), Facebook, etc. El `issuer` será el del proveedor social.
- **Identidad global**: se crea con `(issuer=social-provider, subject=social-id)`. Funciona igual que con IdP institucional.
- **Tenant**: para colaboradores externos, el tenant debe venir de la invitación (Opción A) o de un selector.
- **Recomendación**: habilitar social logins en Zitadel para colaboradores externos, y usar invitaciones globales (Opción A) para que el admin pueda invitar a cualquier email.
- **Seguridad**: social logins tienen menor nivel de verificación de email (algunos proveedores no verifican). La invitación debe requerir `emailVerified=true` (como hoy). Si el proveedor social no lo provee, la invitación es inredimible → correcto por seguridad.

### 15.6 Cross-multi-tenant access

- Un usuario puede pertenecer a N tenants (global_identity_tenants).
- Para acceder a un workspace de otro tenant, necesita: (a) membresía en ese tenant (global_identity_tenants), (b) membresía en el workspace (workspace_memberships en la DB de ese tenant).
- La invitación cross-tenant (Opción A) puede crear ambas: vincular la identidad global al tenant + crear membresía al workspace.
- **No** se permite acceso cross-tenant sin invitación o membresía explícita.

### 15.7 Recomendación

1. **Implementar invitaciones globales (Opción A)**: mover la creación de invitación a un use case que primero crea un registro en router DB (token → tenant+workspace+role+email), y luego redime en el tenant DB. Esto permite invitar a cualquier email con cualquier IdP.
2. **Selector de tenant post-login** para usuarios con múltiples tenants.
3. **Habilitar social logins** en Zitadel (Google personal, Microsoft personal) para colaboradores externos.
4. **Mantener la verificación de email** (`emailVerified=true`) como requisito para redimir invitaciones.
5. **No crear tenants personales** — mantener el modelo de invitación.

### 15.8 Historias de usuario adicionales

- US-R: Como admin, quiero invitar a un colaborador externo (gmail) a un workspace, aunque no esté en mi IdP.
- US-S: Como colaborador externo, quiero usar mi cuenta de Google personal para redimir una invitación.
- US-T: Como usuario con múltiples tenants, quiero seleccionar a cuál entrar tras el login.
- US-U: Como admin, quiero invitar a alguien de otra universidad (otro IdP) a un workspace.
- US-V: Como sistema, quiero resolver el tenant desde la invitación cuando el IdP no lo provee.

---

## 16. Tenant explícito por defecto y tabla de identidad en router DB

### 16.1 Preocupaciones del usuario
- La invitación en router DB solo cubre invitaciones, no logins generales. Se quiere que el tenant sea **explícito para todos los flujos**, y que la verificación por defecto pase por router DB.
- Cualquier usuario debería poder escalar a multi-tenant sin complicación; la estructura debe facilitarlo desde el principio.
- La tabla en router DB no debe conocer workspace ni roles — solo la identificación única del usuario (pareja proveedor+user_id, o identidades externas/personales).
- Se quiere una ruta más robusta, estándar y atomizada: dividir flujos en operaciones pequeñas, auditables, escalables.

### 16.2 Tabla de identidad en router DB (mirror de auth.users, solo identidad)

**Decisión (comité)**: renombrar `global_identities` → `global_users` para homogeneidad con `auth.users` (tenant DB). La tabla es el **registro central de identidad** en router DB:

```
global_users (router DB):
  id (uuid, PK)
  issuer (varchar) — URL del IdP
  subject (varchar) — subject del IdP
  email (varchar, nullable)
  email_verified (boolean)
  full_name (varchar, nullable)
  picture (varchar, nullable)
  created_at
  last_login_at
  UNIQUE(issuer, subject)
```

**Lo que NO contiene**: workspace, roles, author_hash, system_role, handle. Esos son tenant-specific y viven en tenant DB (`auth.users`).

**Tabla de vinculación (ya existe, enriquecer):**
```
global_user_tenants (router DB):
  global_user_id (FK → global_users)
  tenant_id (FK → tenants)
  status (ACTIVE | SUSPENDED | PENDING)
  linked_at
  linked_by (global_user_id del invitador, nullable)
  PRIMARY KEY (global_user_id, tenant_id)
```

**Ventajas:**
- Cualquier usuario puede vincularse a N tenants sin complicación (solo insert en `global_user_tenants`).
- La estructura facilita multi-tenant desde el principio (no es un afterthought).
- Un solo lugar para verificar "¿quién es este usuario?" (router DB).
- Tenant DB solo guarda datos tenant-specific (author_hash, system_role, handle).

### 16.3 Tenant explícito por defecto

**Principio**: el tenant nunca se infiere silenciosamente de claims del IdP como única fuente. En su lugar:

1. **Autenticación (OIDC)** → resuelve identidad (global_user en router DB). El IdP provee identidad, NO tenant.
2. **Resolución de tenant** → consulta `global_user_tenants` para ese global_user:
   - 0 tenants → "sin acceso" o redirigir a invitación.
   - 1 tenant → selección automática (sin fricción).
   - N tenants → selector explícito.
3. **Invitación cross-IdP** → la invitación (global, en router DB) provee el tenant. Al redimir, se vincula la identidad al tenant (`global_user_tenants`) y se crea el tenant user.

**Flujos donde el tenant es implícito (aceptable):**
- Event join (código de evento → tenant en router DB).
- Invitación same-IdP (el admin y el invitado comparten IdP/tenant).

**Flujos donde el tenant debe ser explícito:**
- Login de usuario con múltiples tenants → selector.
- Invitación cross-IdP/externo → tenant de la invitación.
- Admin con múltiples tenants → selector.

### 16.4 Atomización de flujos

En lugar de use cases monolíticos, dividir en operaciones pequeñas, componibles y auditables:

| Operación atómica | Responsabilidad | Entrada | Salida |
|-------------------|-----------------|---------|--------|
| `Authenticate` | OIDC code exchange → identidad global | código OIDC + state | global_user (router DB) |
| `ResolveTenants` | Listar tenants vinculados a una identidad | global_user_id | lista de tenants |
| `SelectTenant` | Vincular identidad a tenant (si no lo está) + crear tenant user | global_user_id, tenant_id | tenant user + session |
| `RedeemInvitation` | Validar token global → vincular identidad a tenant + crear workspace membership | invitation token, global_user | membership |
| `JoinEvent` | Crear usuario anónimo + membresía GUEST en workspace EVENT | código de evento | sesión anónima |
| `RequestWorkspaceAccess` | Crear solicitud PENDING | user, workspace/code | join request |
| `ApproveJoinRequest` | Crear membresía ACTIVE | request_id, admin | membership |
| `CreateWorkspace` | Crear workspace + ontología base + admin membership | admin, datos | workspace |
| `ManageRole` | Asignar/retirar rol en workspace | admin, user, workspace, role, add/remove | membership actualizada |

**Ventajas de la atomización:**
- Cada operación es testeable, auditable y reutilizable.
- El controller compone las operaciones según el flujo.
- Fácil de añadir nuevos flujos sin modificar los existentes.
- Auditoría granular: cada operación genera un evento.

### 16.5 Estructura de sesiones con tenant explícito

- **JWT de VozLab**: contiene `globalUserId`, `tenantId` (seleccionado), `authorHash`. El tenant es explícito en el token.
- **Switch de tenant**: el usuario puede cambiar de tenant sin re-autenticarse (si tiene múltiples). La API emite un nuevo JWT con el nuevo `tenantId`.
- **X-Tenant-ID header**: no necesario si el tenant está en el JWT. Pero para admin multi-tenant, un header `X-Tenant-ID` puede permitir override (con verificación de que el usuario tiene acceso).

### 16.6 Historias de usuario adicionales

- US-W: Como usuario, quiero que el sistema me muestre un selector de tenant si pertenezco a varios, y seleccione automáticamente si solo tengo uno.
- US-X: Como admin, quiero que la tabla de identidad en router DB sea la fuente única de verdad para "quién es este usuario".
- US-Y: Como desarrollador, quiero que cada operación de auth/onboarding sea atómica y testeable independientemente.
- US-Z: Como sistema, quiero que el tenant nunca se infiera silenciosamente de claims del IdP como única fuente.

### 16.7 Recomendaciones actualizadas

**P0 (adicionales):**
- Enriquecer `global_identities` en router DB como tabla de identidad central (solo identidad, sin workspace/roles).
- Tenant explícito por defecto: autenticación → resolución de tenant → selección.
- Atomizar flujos en operaciones pequeñas y auditables.

**P1 (adicionales):**
- Selector de tenant post-login (multi-tenant).
- Switch de tenant sin re-autenticación.
- Auditoría por operación atómica.

---

## 18. Revisión exhaustiva: brechas, vulnerabilidades, rutas faltantes, mejores prácticas

### 18.1 Vulnerabilidades identificadas
- **Token de invitación en URL**: queda en historial/logs/referrers. Mitigación: single-use + TTL 72h + email-bound + HTTPS obligatorio. Considerar fragmento (`#token`) para evitar envío al servidor en referrer. Añadir `Referrer-Policy: no-referrer`.
- **Event join anónimo**: código de evento global puede ser brute-forceado. Mitigación: rate limit por IP, códigos largos (≥128 bits), expiry corto, max_uses.
- **XSS → robo de access token**: token en memoria; CSP estricta, no localStorage. Refresh token en cookie HttpOnly.
- **CSRF en /auth/refresh**: cookie SameSite=Lax/Strict + double-submit token o Origin check.
- **Tenant mismatch → 404**: ya implementado; verificar todos los endpoints.
- **Último admin**: protección existe; verificar en suspensión/reactivación.
- **Social login email no verificado**: invitación inredimible si emailVerified=false (correcto).
- **Handle unicidad**: debe ser único por tenant (índice parcial).
- **Refresh family reuse**: detección implementada; verificar invalidación al suspender (P1).

### 18.2 Rutas faltantes / por implementar
- `POST /api/v1/auth/select-tenant` (selector multi-tenant).
- `POST /api/v1/auth/switch-tenant` (re-issue JWT).
- `POST /api/v1/workspaces/:id/join-codes` (CRUD códigos efímeros).
- `POST /api/v1/invitations/global` (invitación cross-IdP en router DB).
- `POST /api/v1/admin/cleanup` (invitaciones expiradas + guests inactivos).
- `GET /api/v1/tenants/me` (lista de tenants vinculados).
- Middleware de rate limit dedicado por actor en rutas admin.

### 18.3 Mejores prácticas
- HTTPS obligatorio en producción; HSTS.
- Tokens opacos (SHA-256 at rest), single-use, TTL corto.
- Idempotencia en endpoints de creación (invitación, código).
- Auditoría append-only (global_identity_events + membership_events).
- Separación física de DBs (router vs tenant) — ya implementado.
- Guard order: authGuard → tenantWorkspaceGuard/workspaceAdminGuard → rateLimit.
- No PII en router DB excepto identidad (email, nombre) — mínimo necesario.
- Validación Zod en todos los inputs.
- Tests por operación atómica.

### 18.4 Brechas de implementación (estado actual)
- Invitaciones globales (router DB): esquema creado, use cases pendientes.
- Tenant explícito: port method + use cases creados, integración en CompleteOidcLogin pendiente (sigue resolviendo por claims).
- Múltiples roles: esquema + getRoles implementado; use cases de membresía asumen un rol (pendiente adaptar a unión).
- Códigos efímeros: tabla creada; port/adapter/use cases pendientes.
- GUEST role: en shared-types; guards pendientes.
- workspaces.kind: columna creada; guards/use cases pendientes.
- users.handle: columna creada; alta directa pendiente de adaptar.
- Atomización: port IAuditLog creado; refactor pendiente.
- Social logins: guía creada; config en Zitadel pendiente.
- QR ambos códigos: nota; cliente pendiente.
- Consolidación UI Miembros: nota; web pendiente.

## 19. Conclusión del comité (v5)

El modelo actual es **coherente en su núcleo** pero necesita una **evolución hacia tenant explícito por defecto**:

1. **Tabla de identidad en router DB** (`global_users`) como fuente única de verdad para "quién es este usuario" (solo identidad, sin workspace/roles).
2. **Tenant explícito por defecto**: autenticación → resolución de tenant → selección (no inferir silenciosamente de claims del IdP).
3. **Invitaciones globales** (token en router DB) para cross-IdP/externos.
4. **Selector de tenant post-login** para usuarios multi-tenant.
5. **Social logins** en Zitadel para colaboradores externos.
6. **Atomización de flujos** en operaciones pequeñas, auditables y reutilizables.
7. **Multi-tenant desde el principio**: cualquier usuario puede vincularse a N tenants sin complicación.

Mantener: OIDC como identidad, invitación como URL/QR, código de workspace como dirección, roles por unión (sin personificación), GUEST acotado (sí puede crear propuestas PENDING), tipificación de workspaces. No implementar contraseñas propias ni tenants personales. Consolidar flujos redundantes.

**P0 consolidado (seguridad/coherencia):**
1. Alta directa por admin: dejar de usar email, usar handle/identidad global.
2. Múltiples roles por workspace (esquema + unión, sin personificación).
3. Códigos de workspace efímeros y revocables.
4. `workspaces.kind` + `users.is_anonymous`.
5. Rol GUEST acotado.
6. Auto-aprobación configurable por workspace.
7. Invitaciones globales (router DB) para cross-IdP/externos.
8. Enriquecer `global_identities` como tabla de identidad central.
9. Tenant explícito por defecto.

**P1 (operación):**
10. Invalidar refresh family al suspender.
11. Auditoría por operación atómica.
12. Rate limit dedicado por actor.
13. Selector de tenant post-login.
14. Habilitar social logins en Zitadel.
15. Switch de tenant sin re-autenticación.
16. Limpieza de invitaciones expiradas y guests inactivos.

**P2 (producto):**
17. Atomizar flujos en use cases pequeños.
18. QR con ambos códigos para eventos.
19. Consolidar UI de "Miembros".
20. Documentar matriz de decisión en requirements.md.