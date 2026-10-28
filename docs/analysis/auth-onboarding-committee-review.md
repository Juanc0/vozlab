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
  - Rol `GUEST` acotado — aprobado, pero aclarar qué es "propuesta sensible".
  - Alta directa por admin debe dejar de usar email; usar identidad global o handle único por tenant.
  - Un usuario puede tener múltiples membresías y múltiples roles por workspace; las verificaciones deben considerar todos los roles.
  - Códigos de acceso separados: tenant vs workspace, con auto-aprobación configurable por tipo de usuario y tipo de workspace.
  - Evento: QR con ambos códigos (tenant + workspace) en un solo paso.
  - Invitación: URL/QR compartible, con rol asignado de una vez; seguro por token + email verificado por IdP.

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

**P1 (operación):**
7. Invalidar refresh family al suspender.
8. Auditoría de acciones admin.
9. Rate limit dedicado por actor.
10. Selector de tenant si varios.
11. Limpieza de invitaciones expiradas y guests inactivos.

**P2 (producto):**
12. QR con ambos códigos para eventos.
13. Consolidar UI de "Miembros".
14. Documentar matriz de decisión en requirements.md.
15. Event join: exponer en admin conteo de usos y rotación.

---

## 15. Conclusión del comité

El modelo actual es **coherente en su núcleo** pero necesita: (a) cambiar alta directa de email a identidad global/handle, (b) permitir múltiples roles por workspace con verificación por unión (sin personificación), (c) códigos de workspace efímeros con auto-aprobación configurable, (d) tipificación de workspaces y rol GUEST acotado, (e) QR de evento con ambos códigos. La invitación como URL/QR es segura por diseño: el token es opaco/single-use/TTL y la redención requiere email verificado por el IdP; la membresía se crea server-side en transacción (tenant implícito + workspace + rol), y el token no contiene datos sensibles. Los guests SÍ pueden crear propuestas (quedan PENDING) porque es el foco de las funcionalidades a mostrar. No implementar contraseñas propias, magic links ni envío de email por ahora. Consolidar flujos redundantes.