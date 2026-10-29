# Tareas de identidad y extracción para implementar por partes

> Pensado para un modelo pequeño o para una persona nueva en el proyecto. Cada tarea es un cambio pequeño y revisable.
> Antes de cada tarea, lee solo la sección de la guía `01-explicacion-logins-y-ia.md` que indica la tarea.
> Fecha de verificación de rutas: 2026-10-23.

## Reglas generales

1. **Una tarea, un cambio.** No mezcles tareas ni refactorices otra cosa de paso.
2. **Lee antes de escribir.** Abre los archivos de "Leer primero". Si una ruta o una función no existe, **para y pregunta**. No inventes nombres.
3. **Convenciones del repo** (`AGENTS.md`): en TypeScript, los imports relativos terminan en `.js`; `domain/` no importa Fastify, Drizzle ni `pg`; la composición se hace a mano en `infrastructure/http/server.ts` y `routes.ts`; código e identificadores en inglés.
4. **Rutas sensibles** (autenticación, tenancy y escritura de IA): requieren revisión humana (D-36 en `knowledge-transfer/15`).
5. **Secretos:** nada real en el repositorio. Usa placeholders. `.env` no se commitea.
6. **Prohibido el flujo de contraseña (ROPC)**, en código y en pruebas. Prueba con código y PKCE, o con tokens firmados de prueba.
7. **Verificación:** la de cada tarea y, al final, `pnpm turbo run build type-check test` (TypeScript), o `uv run pytest` y `uv run ruff check packages/worker-shared apps/worker-embedder apps/worker-relacionador apps/worker-extractor` (Python).
8. **Estado:** `[ ]` pendiente · `[!]` requiere decisión humana antes de codificar · `[x]` hecho.
9. **Tablero:** `ROADMAP.md` es el único tablero vivo (AGENTS.md). Estas tareas se copian ahí solo cuando una persona las apruebe (tarea F5).

### Rutas de referencia

- **Identidad (API):** `apps/api/src/infrastructure/identity/OidcProviderClient.ts`, `apps/api/src/infrastructure/identity/RedisOidcStateStore.ts`, `apps/api/src/application/use_cases/StartOidcLoginUseCase.ts`, `apps/api/src/application/use_cases/CompleteOidcLoginUseCase.ts`, `apps/api/src/application/use_cases/RefreshSessionUseCase.ts`, `apps/api/src/infrastructure/persistence/repositories/DrizzleUserRepository.ts`, `apps/api/src/domain/ports/IIdentityProvider.ts`, `apps/api/src/domain/ports/IUserRepository.ts`, `apps/api/src/domain/errors/DomainError.ts`, `packages/shared-types/src/errors/http-errors.ts`.
- **Identidad (docs):** `docs/auth-and-tenancy.md` (JIT, membresías y guardas).
- **Esquema:** `packages/database/src/schema/tenant.auth.schema.ts`, `packages/database/src/schema/router.schema.ts`, `packages/database/src/schema/tenant.public.schema.ts`.
- **Pruebas existentes** (extender, no duplicar): `apps/api/tests/infrastructure/OidcProviderClient.test.ts`, `apps/api/tests/application/CompleteOidcLoginUseCase.test.ts`, `apps/api/tests/application/StartOidcLoginUseCase.test.ts`, `apps/api/tests/integration/auth.integration.test.ts`, `apps/api/tests/integration/support/mockOidc.ts`.
- **Extractor:** `apps/worker-extractor/src/worker_extractor/handler.py`, `llm.py`, `settings.py`, `models.py`; pruebas en `apps/worker-extractor/tests/test_handler.py` y `test_llm.py`.
- **Relator:** `apps/worker-relacionador/src/worker_relacionador/handler.py`.
- **Infraestructura:** `docker-compose.yml`, `.env.example`, `docker/postgres/Dockerfile`; el laboratorio de identidad va aparte, en `docker/identity-lab/`.
- **Contratos:** `packages/shared-types/src/schemas/node.schema.ts`, `edge.schema.ts`, `proposal.schema.ts`, `ingestion.schema.ts`.
- **Compartido de workers:** `packages/worker-shared/src/vozlab_worker/streams.py`, `api.py`.
- **Decisiones:** `docs/decisions/`. ADR-0013 (pseudonimia), ADR-0018 (identidad y sesiones), ADR-0024 (lotes), ADR-0026 (propuestas). El último es ADR-0027, así que el siguiente es ADR-0028.

---

## Bloque A. Decisiones (las toma una persona; no es código)

### A1 [!] Sistema de acceso de la universidad
- **Objetivo:** saber qué proveedor usa la universidad y qué atributos entrega.
- **Leer primero:** guía 01, sección 7.1.
- **Hacer:** enviar las seis preguntas de la sección 7.1 a TI. Guardar las respuestas en `knowledge-transfer/guia-identidad-ia/respuestas-ti.md`, sin datos personales.
- **Aceptación:** cada pregunta tiene respuesta o la marca "no sabe". Fecha registrada.

### A2 [!] Broker de identidad
- **Objetivo:** decidir si el broker es Keycloak autoalojado, Zitadel, Authentik, un SaaS o un módulo dentro de la API. Recomendación: **Keycloak fuera de la API**.
- **Leer primero:** guía 01, secciones 8.3 a 8.5, y D2/D13 de la sección 13.
- **Hacer:** anotar la decisión en el borrador del ADR de la tarea F1.
- **Aceptación:** decisión escrita, con fecha y responsable.

### A3 [!] Índice global: alcance y privacidad
- **Objetivo:** confirmar **M2a** (solo identidades) o **M2b** (identidades + pertenencia), la finalidad, la base legal y la retención.
- **Leer primero:** guía 01, secciones 6, 6.3 y 6.4; `docs/decisions/ADR-0013-random-opaque-pseudonym.md`; D-23 en `knowledge-transfer/15`.
- **Hacer:** escribir la decisión en el borrador del ADR de F1. Si se elige M2b, pedir revisión jurídica y una evaluación de impacto antes de codificar.
- **Aceptación:** decisión escrita con alcance, finalidad, retención y responsable. Para M2b, revisión jurídica registrada.

### A4 [!] Deduplicación por capas
- **Objetivo:** aprobar el enfoque de la guía 01, sección 12.6, y aportar de 30 a 50 registros de ejemplo.
- **Leer primero:** guía 01, secciones 12.4 a 12.6 y 12.9.
- **Aceptación:** enfoque aprobado. Los registros reales solo se guardan en el repositorio después de que jurídico apruebe su uso (D-16). Mientras tanto, usar registros sintéticos.

### A5 [!] Alcance del Extractor: nodos, aristas y lotes
- **Objetivo:** decidir si el Extractor propone aristas (D7) y si se acepta un paquete por registro (D8).
- **Leer primero:** guía 01, sección 12.3; `docs/decisions/ADR-0024-no-batch-node-endpoint.md`; `docs/decisions/ADR-0026-merge-contract.md`.
- **Aceptación:** decisión escrita. Si D8 se aprueba, la tarea F2 (ADR) va antes de cualquier cambio de API para lotes.

### A6 [!] Ruta del laboratorio de identidad
- **Objetivo:** elegir Keycloak local, LLDAP + Keycloak, Authentik, Samba y/o mock, y el tiempo disponible.
- **Leer primero:** guía 01, secciones 9.2 y 9.3.
- **Aceptación:** decisión escrita y tiempo asignado. LLDAP no es un IdP OIDC/SAML; si se elige, va con Keycloak. mock-oauth2-server es solo OIDC y va en CI.

### A7 [!] Invitaciones y alta directa
- **Objetivo:** decidir cómo se liga una invitación (correo verificado, código o identidad conocida), quién puede invitar y qué pasa si el correo no coincide.
- **Leer primero:** guía 01, sección 6.5; `docs/auth-and-tenancy.md` (JIT no da acceso a workspace).
- **Aceptación:** decisión escrita. Por defecto: correo verificado + código de respaldo; invita el `ADMIN` del workspace; alta directa solo para identidades conocidas.

### A8 [!] Auditoría
- **Objetivo:** decidir retención, quién lee los eventos y si se exige cadena de hashes.
- **Leer primero:** guía 01, sección 6.6.
- **Aceptación:** decisión escrita. Por defecto: append-only, sin PII, 1 año en la institución y 2 en el router [juicio].

---

## Bloque B. Laboratorio de identidad local

Todo el bloque vive en `docker/identity-lab/`. **No cambia** el `docker-compose.yml` principal.

### B1 Compose del laboratorio
- **Estado:** `[ ]` · **Depende de:** A2 · **Tamaño:** S
- **Objetivo:** un `compose.yml` propio que levante Keycloak y su base de datos.
- **Leer primero:** `docker-compose.yml` (servicios y red `vozlab-net`), `docker/postgres/Dockerfile`, `.env.example` (líneas 35 a 47, variables OIDC).
- **Hacer:**
  1. Crear `docker/identity-lab/compose.yml` con `keycloak` (imagen oficial de Keycloak 26.8.x; fijar etiqueta y digest después de verificarlos) y `keycloak-db` (PostgreSQL oficial, misma versión mayor que el resto del repo [verificar etiqueta]).
  2. Publicar Keycloak solo en `127.0.0.1:8080`.
  3. Arranque con `start-dev --import-realm`, y el realm en `docker/identity-lab/realms/` [verificar opciones de la versión].
  4. Crear `docker/identity-lab/.env.example` con placeholders para las contraseñas de administrador y de base de datos.
- **No hacer:** no usar `start-dev` fuera de este laboratorio. No versionar `.env`.
- **Aceptación:**
  - `docker compose -f docker/identity-lab/compose.yml config -q` termina sin error.
  - `curl -fsS http://127.0.0.1:8080/realms/vozlab/.well-known/openid-configuration` devuelve JSON con `"issuer": "http://localhost:8080/realms/vozlab"`, igual a `OIDC_ISSUER` de `.env.example`.

### B2 Directorio ligero con LLDAP (ruta rápida)
- **Estado:** `[ ]` · **Depende de:** A6, B1 · **Tamaño:** S
- **Objetivo:** un directorio LDAP con cinco personas de prueba y tres grupos. **LLDAP solo es servidor LDAP**; Keycloak (B1/B4) es quien expone OIDC y SAML.
- **Leer primero:** guía 01, secciones 3.4 y 9.2; README de LLDAP y su carpeta `example_configs` (web).
- **Hacer:**
  1. Añadir el servicio `lldap` al compose de B1, con imagen oficial fijada. La interfaz web solo en loopback. El puerto LDAP solo en la red interna.
  2. Crear las personas `ana.admin`, `luis.mod`, `marta.autora`, `carlos.externo`, `eva.otra` y los grupos `vozlab-admins`, `vozlab-moderators`, `vozlab-members`, desde la interfaz web o con el script de arranque de LLDAP.
- **No hacer:** no exponer el puerto LDAP al anfitrión. No esperes que LLDAP responda OIDC o SAML: para eso está Keycloak.
- **Aceptación:** una búsqueda LDAP desde un contenedor de la red interna devuelve `ana.admin` [verificar el DN base con la documentación de LLDAP].

### B3 Dominio AD de prueba con Samba
- **Estado:** `[ ]` · **Depende de:** A6, B1 · **Tamaño:** M
- **Objetivo:** un dominio AD con usuarios, grupos y una cuenta deshabilitada.
- **Leer primero:** guía 01, sección 9.4.
- **Hacer:**
  1. Elegir la imagen: (a) comunitaria, con digest fijado, o (b) un Dockerfile propio sobre Ubuntu con los paquetes de Samba. La opción (b) es la recomendada para aprender. Documentar la elección en `docker/identity-lab/samba/README.md`.
  2. Red Docker propia `identity-lab`. No publicar el puerto 53 al anfitrión. IP fija si hace falta.
  3. Aprovisionar con `samba-tool domain provision --domain=VOZLAB --realm=VOZLAB.TEST --adminpass=<de .env> --server-role=dc --use-rfc2307 --dns-backend=SAMBA_INTERNAL` (guía oficial de Ubuntu para Samba).
  4. Crear `ana.admin`, `luis.mod`, `marta.autora`, `carlos.externo`, `eva.otra`, la cuenta de solo lectura `svc-keycloak` y los grupos de B2 [verificar sintaxis con `samba-tool --help`].
  5. Deshabilitar `carlos.externo` **solo después** de la prueba de B5.
- **No hacer:** no habilitar LDAP sin cifrar, salvo que el README lo marque como "solo laboratorio". No guardar contraseñas en el repositorio.
- **Aceptación:**
  - `samba-tool user list`, dentro del contenedor, incluye las cinco personas.
  - Tras el paso 5, `samba-tool user show carlos.externo` muestra la cuenta deshabilitada.
  - Una búsqueda LDAPS con certificado de confianza devuelve `ana.admin`.

### B4 Realm de Keycloak y cliente de VozLab
- **Estado:** `[ ]` · **Depende de:** B1 · **Tamaño:** S
- **Objetivo:** un realm `vozlab` con el cliente `vozlab-api` y cinco usuarios locales de prueba.
- **Leer primero:** `.env.example` (`OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`); guía 01, sección 3.2.
- **Hacer:**
  1. Crear `docker/identity-lab/realms/vozlab-realm.json` con el cliente `vozlab-api` **confidencial** (secreto de placeholder), la redirección `http://localhost:3000/api/v1/auth/callback`, PKCE con `S256` [verificar el atributo exacto] y los alcances `openid profile email`.
  2. Usuarios de prueba con `emailVerified: true` y contraseñas de placeholder.
  3. Atributo `vozlab_tenant` por usuario (`universidad-a` o `universidad-b`), editable solo por administrador.
- **No hacer:** no habilitar el registro de usuarios. No usar el flujo de contraseña en el cliente.
- **Aceptación:** el login de `ana.admin` en el navegador completa el flujo code + PKCE y regresa al `redirect_uri` con un código.

### B5 Federación del directorio en Keycloak (solo lectura)
- **Estado:** `[ ]` · **Depende de:** B2 o B3, y B4 · **Tamaño:** M
- **Objetivo:** que Keycloak valide las contraseñas contra el directorio sin guardarlas.
- **Leer primero:** guía 01, secciones 3.4 y 4.
- **Hacer:** en la administración de Keycloak, *User federation*, proveedor LDAP. Modo de edición `READ_ONLY`. Cuenta de enlace `svc-keycloak`. Atributo de usuario `uid` (LLDAP) o `sAMAccountName` (AD). Atributo UUID: el que exponga el directorio, `objectGUID` en AD [verificar]. Usar "Test connection" y "Test authentication".
- **No hacer:** no conceder escritura al directorio. No copiar contraseñas al realm.
- **Aceptación:**
  - El login de `ana.admin` a través de Keycloak funciona.
  - Tras deshabilitar `carlos.externo` (B3, paso 5), su login falla.

### B6 Claim `tid` y claims canónicos en el laboratorio
- **Estado:** `[ ]` · **Depende de:** B4 · **Tamaño:** S
- **Objetivo:** que el ID token traiga `tid` (institución), `email_verified`, `name`, `email`, `aud` e `iss`.
- **Leer primero:** guía 01, sección 8.2 (de dónde sale `tid`); `OidcProviderClient.ts` (`exchangeCode`, líneas 109 a 171).
- **Hacer:** crear un *mapper* de atributo de usuario `vozlab_tenant` → claim `tid`, en el ID token y en el access token.
- **Aceptación:** decodificar el ID token **en local** (la parte central en base64, sin pegarlo en servicios externos) muestra `tid: "universidad-a"` para `ana.admin`, `aud: "vozlab-api"` e `iss` del realm.

### B7 Prueba de humo del laboratorio (sin secretos)
- **Estado:** `[ ]` · **Depende de:** B6 · **Tamaño:** S
- **Objetivo:** comprobar en un comando que el laboratorio responde y publica claves.
- **Hacer:** crear `docker/identity-lab/smoke.sh`, que compruebe sin imprimir secretos: el discovery responde 200, el JWKS tiene al menos una clave y el `issuer` coincide con `OIDC_ISSUER`.
- **Aceptación:** `bash docker/identity-lab/smoke.sh` sale con código 0 con el laboratorio arriba, y con código distinto de 0 si está apagado.

### B8 Authentik: OIDC + SAML + LDAP en una sola herramienta (opcional)
- **Estado:** `[ ]` · **Depende de:** A6 · **Tamaño:** M
- **Objetivo:** evaluar Authentik como laboratorio único para los tres protocolos, sin Samba.
- **Leer primero:** guía 01, secciones 8.4 y 9.2; documentación de Authentik (proveedores OIDC y SAML, y *LDAP outpost*).
- **Hacer:**
  1. Crear `docker/identity-lab/authentik/compose.yml` con `authentik-server`, `authentik-worker`, PostgreSQL y Redis. Fijar etiquetas y digests después de verificarlos.
  2. Publicar la interfaz solo en `127.0.0.1:9000`.
  3. Crear un usuario de prueba, una aplicación OIDC y una aplicación SAML.
  4. Comprobar el *LDAP outpost* con `ldapsearch` desde la red interna.
- **No hacer:** no sustituir el laboratorio de Keycloak; es una alternativa para comparar. No usar la edición empresarial.
- **Aceptación:** un login OIDC y uno SAML terminan en una aplicación de prueba; `ldapsearch` devuelve el usuario. Documentar la RAM usada y la licencia exacta.

### B9 SAML 2.0 de extremo a extremo entre dos realms de Keycloak
- **Estado:** `[ ]` · **Depende de:** B4 · **Tamaño:** M
- **Objetivo:** probar SAML 2.0 sin escribir un SP propio: un realm actúa como IdP y otro como SP.
- **Leer primero:** guía 01, secciones 3.3 y 8.4.
- **Hacer:**
  1. En el realm `vozlab`, crear un cliente SAML con la URL de consumo de aserción (ACS) del realm SP.
  2. Crear un segundo realm `vozlab-sp` con un proveedor de identidad SAML que apunte al cliente del realm `vozlab`.
  3. Iniciar sesión desde el SP y comprobar la aserción, el `NameID` y los atributos.
- **No hacer:** no añadir SAML a la API todavía; esta tarea valida el laboratorio, no el adaptador.
- **Aceptación:** el login iniciado por el SP funciona y el usuario del realm IdP llega al SP. Documentar que es SAML 2.0, no SAML 1.1.

---

## Bloque C. API: identidad segura

Estas tareas tocan autenticación. **Requieren revisión humana** (D-36).

### C1 Pruebas de contrato del adaptador OIDC
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** nada
- **Objetivo:** cubrir los casos de ataque básicos en `OidcProviderClient`.
- **Leer primero:** `apps/api/src/infrastructure/identity/OidcProviderClient.ts` (109 a 171 y 221 a 244); `apps/api/tests/infrastructure/OidcProviderClient.test.ts`.
- **Hacer:** añadir pruebas para: firma con clave desconocida; `iss` distinto; `aud` distinto; `alg: none`; `nonce` distinto; `email_verified: false` (debe dar `ERR_EMAIL_NOT_VERIFIED`); sin `tid` ni `hd` (debe dar `ERR_OIDC_EXCHANGE_FAILED`); con `tid` y `hd` a la vez (gana `tid`).
- **No hacer:** no cambiar el comportamiento del adaptador en esta tarea.
- **Aceptación:** `pnpm --filter @vozlab/api test` pasa. Cada caso falla si se rompe la validación que prueba.

### C2 `email_verified` ausente deja de contar como verificado
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C1
- **Objetivo:** distinguir "verificado", "no verificado" y "no afirmado".
- **Leer primero:** `IIdentityProvider.ts` (tipo `OidcIdentity`); `OidcProviderClient.ts` (138 a 162); `CompleteOidcLoginUseCase.ts` (61 a 63); `DrizzleUserRepository.ts` (77 a 133).
- **Hacer:**
  1. Cambiar `emailVerified` a `boolean | null` en `OidcIdentity`. `null` significa que el proveedor no lo afirmó.
  2. En `exchangeCode`, devolver `null` cuando el claim falta (hoy, la línea 140 lo fija a `true`).
  3. Pasar el valor al repositorio. **Vincular por correo solo si es `true`.** Con `null`, se crea una cuenta nueva sin vincular.
- **Aceptación:** pruebas nuevas en `CompleteOidcLoginUseCase.test.ts` y en `OidcProviderClient.test.ts`. `pnpm turbo run build type-check test` pasa.

### C3 Tabla de identidades externas `(issuer, subject)`
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C2
- **Objetivo:** guardar el emisor junto al `sub`.
- **Leer primero:** `tenant.auth.schema.ts` (`users`, 26 a 47); `docs/decisions/ADR-0003-drizzle-schema-source-of-truth.md`; `docs/decisions/ADR-0018-oidc-jit-hybrid-sessions.md`.
- **Hacer:**
  1. Añadir la tabla `auth.external_identities`: `id`, `user_id` (clave externa a `users`, con borrado en cascada), `issuer` (varchar 512), `subject` (varchar 255), `provider_kind`, `created_at` y `last_login_at`. Índice único `(issuer, subject)` e índice por `user_id`.
  2. Generar la migración con `pnpm --filter @vozlab/database db:generate:tenant`.
  3. Script de relleno `packages/database/scripts/backfill-external-identities.ts`: recibe el emisor como argumento y usa `ON CONFLICT DO NOTHING`.
- **No hacer:** no borrar todavía `users.provider_user_id`.
- **Aceptación:** la migración se aplica sobre una base vacía. El relleno se puede ejecutar dos veces con el mismo resultado.

### C4 Búsqueda por identidad, no por correo
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C3
- **Objetivo:** que una identidad nueva con un correo ya existente **no reasigne** la cuenta.
- **Leer primero:** `DrizzleUserRepository.ts` (77 a 133); `IUserRepository.ts` (`findOrCreateOidcUser`, línea 49).
- **Hacer:** nuevo método `findOrCreateByExternalIdentity({issuer, subject, email, emailVerified, fullName}, tid)`:
  1. Si existe `(issuer, subject)`, actualizar el perfil y devolver el usuario.
  2. Si no existe y el correo ya pertenece a otra cuenta, devolver `ERR_ACCOUNT_LINK_CONFLICT`. **No reasignar nada.**
  3. Si no hay correo coincidente, crear la cuenta nueva.
  4. Eliminar la reasignación de `provider_user_id` (líneas 122 a 131 de `DrizzleUserRepository.ts`).
- **Aceptación:** pruebas. Misma identidad, mismo usuario. Mismo correo con otro emisor, conflicto. Mismo correo con otro `sub` del mismo emisor, conflicto. Sin correo, cuenta nueva.

### C5 El login fija la institución y se comprueba al volver
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C1
- **Objetivo:** que el token de regreso pertenezca a la institución que se pidió al iniciar sesión.
- **Leer primero:** `StartOidcLoginUseCase.ts`, `RedisOidcStateStore.ts`, `CompleteOidcLoginUseCase.ts` (47 a 71), `packages/shared-types/src/errors/http-errors.ts`.
- **Hacer:**
  1. Aceptar un parámetro opcional `institution` al iniciar el login. Resolverlo a `tenants.oidc_tenant_id` y guardarlo en el estado.
  2. Al completar: si el estado tiene institución y `identity.tenantKey` no coincide, devolver `ERR_TENANT_MISMATCH` (nuevo código en `DomainError.ts` y en los códigos compartidos).
- **No hacer:** no leer la institución desde el navegador en el callback.
- **Aceptación:** sin institución, el comportamiento es el actual. Institución distinta, error. Institución igual, éxito.

### C6 Tipo `ExternalIdentity` (normalización sin cambio de comportamiento)
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** C2
- **Objetivo:** un solo tipo que describa cualquier identidad externa. Prepara SAML y LDAP sin implementarlos.
- **Leer primero:** `IIdentityProvider.ts`; guía 01, sección 8.2.
- **Hacer:** crear el tipo en `apps/api/src/domain/` (sin dependencias de infraestructura) con `issuer`, `subject`, `email`, `emailVerified` (`true | false | null`), `fullName`, `tenantKey` y `providerKind`. Adaptar `OidcProviderClient` para devolverlo.
- **Aceptación:** `pnpm turbo run build type-check test` pasa sin cambiar las pruebas existentes.

### C7 Cerrar las sesiones de una cuenta desactivada [!]
- **Estado:** `[!]` (decidir quién puede desactivar cuentas y cómo) · **Tamaño:** M · **Depende de:** C3
- **Objetivo:** que una baja tenga efecto inmediato dentro de VozLab.
- **Leer primero:** guía 01, secciones 2.4 y 10; ADR-0018 (refresh rotado y bloqueo del `jti`); `RefreshSessionUseCase.ts`; el middleware de autenticación en `apps/api/src/infrastructure/http/middlewares/`.
- **Propuesta (aprobar antes):** un campo `sessions_valid_after` en `auth.users`. El refresco y el middleware rechazan tokens con `iat` anterior a ese valor. Un comando `db:revoke-sessions -- --user <id>` lo actualiza y revoca las familias de refresco.
- **Aceptación:** tras revocar, un refresco devuelve error. Un access token emitido antes deja de valer en la siguiente petición.

### C8 HMAC del subject en la base de la institución [prioridad baja]
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** C3 y de decidir dónde guardar la clave
- **Objetivo:** evaluar si se guarda el `subject` en claro en la base de la institución. **No** promete no correlación: el `global_identity_id` del router es el vínculo autorizado (guía 01, sección 6.3).
- **Hacer:** **si se aprueba**, sustituir `subject` por `subject_hmac` en `external_identities`, con `HMAC-SHA256(clave de la institución, issuer + "|" + subject)`. La búsqueda del login usa `(issuer, subject_hmac)`; el `subject` en claro solo existe en memoria durante el login. No guardes ambos. Si no se aprueba, deja C3 como está y documenta la decisión.
- **No hacer:** no añadir `subject_hmac` junto al `subject`: sería duplicación sin beneficio.
- **Aceptación:** el mismo `(issuer, subject)` en dos instituciones produce valores distintos; el `subject` en claro no aparece en la tabla; el login sigue funcionando; la clave nunca aparece en logs. Un test confirma que el `global_identity_id` sigue siendo el mismo: la correlación existe y está controlada.

---

## Bloque D. Varias instituciones

### D1 Proveedores de identidad por institución, en el router [!]
- **Estado:** `[!]` (requiere el ADR de F1 aceptado) · **Tamaño:** M
- **Objetivo:** que cada institución tenga su propia configuración de proveedor (emisor, client_id, JWKS, tipo).
- **Leer primero:** `packages/database/src/schema/router.schema.ts` (`tenants`, 17 a 26; `tenantConnections`, 74 a 86); `knowledge-transfer/08`, sección 4.
- **Hacer:** tabla `tenant_identity_providers` con `tenant_id`, tipo (`INSTITUTIONAL`, `GUEST` o `LAB`), `issuer`, `client_id`, `jwks_url`, URLs de autorización, token y userinfo, y `enabled`. Migración con `pnpm --filter @vozlab/database db:generate:router`.
- **No hacer:** no guardar secretos de cliente en claro. Guardar una referencia a un almacén de secretos.
- **Aceptación:** pruebas del repositorio con dobles de prueba. Migración aplicada sobre una base vacía.

### D2 Ruta de login por institución
- **Estado:** `[ ]` · **Depende de:** C5 y D1 · **Tamaño:** M
- **Objetivo:** `GET /api/v1/auth/login?institution=<slug>` usa la configuración de esa institución.
- **Leer primero:** `routes.ts` (rutas de auth, 228 a 271); guía 01, sección 6.2.
- **Hacer:** resolver la institución por `slug`. Si no existe o no está habilitada, devolver `ERR_TENANT_NOT_PROVISIONED` (403 según ADR-0018).
- **Aceptación:** pruebas con institución válida, slug desconocido e institución deshabilitada.

### D3 Invitaciones por institución: tabla y alta [!]
- **Estado:** `[!]` (depende de A7) · **Tamaño:** M · **Depende de:** C3 y D11
- **Objetivo:** que un `ADMIN` cree, reenvíe y revoque invitaciones sin crear todavía una cuenta.
- **Leer primero:** guía 01, sección 6.5; `tenant.auth.schema.ts` (`workspace_memberships`, 49 a 70); `docs/auth-and-tenancy.md` (JIT no da acceso a workspace).
- **Hacer:**
  1. Crear `auth.invitations` con `id`, `workspace_id`, `email` (nullable, solo en la base de la institución), `email_hash` (nullable), `role`, `token_hash`, `expires_at`, `max_uses`, `used_count`, `status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`), `revoked_at`, `created_by` y `created_at`. Índice único por `token_hash` e índice por `workspace_id`; si `email` no es `NULL`, `email_hash` es obligatorio.
  2. Generar un token aleatorio de un solo uso; guardar solo su SHA-256 y devolverlo una vez al administrador.
  3. Reenviar genera un token nuevo y rota el hash; el token anterior deja de valer.
  4. Añadir `status` a `auth.workspace_memberships` con default `ACTIVE` (`INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`) para no borrar filas al suspender.
  5. Auditar `INVITED` y `INVITATION_REVOKED` con `invitation_id` y `user_id = NULL` (D11).
- **No hacer:** no guardar el token en claro. No enviar el correo al router. No crear la identidad global ni la cuenta local en esta tarea. No permitir invitar a otra institución.
- **Aceptación:** crear una invitación devuelve el token una sola vez; la base solo tiene el hash; un `ADMIN` de otra institución recibe 404; tras reenviar, el token anterior falla; las membresías existentes quedan en `ACTIVE` tras la migración. Caducidad y revocación se pueden probar sin canjear todavía.

### D4 Verificación de dominio por DNS [solo diseño]
- **Estado:** `[ ]` · **Depende de:** A1 · **Tamaño:** S
- **Objetivo:** diseñar cómo una institución demuestra que controla `@ejemplo.edu` antes de que ese dominio se use en reglas de acceso.
- **Hacer:** documento corto en `knowledge-transfer/guia-identidad-ia/` con el flujo (registro TXT, reintentos, caducidad, revocación) y la tabla propuesta en el router.
- **Aceptación:** documento revisado por una persona. No se codifica todavía.

### D5 Prueba de correlación controlada
- **Estado:** `[ ]` · **Depende de:** C8 y D6 · **Tamaño:** S
- **Objetivo:** demostrar que el router une al mismo `(issuer, subject)` y que la base de la institución no guarda el `subject` en claro.
- **Hacer:** prueba de integración con dos instituciones de prueba y el mismo `(issuer, subject)`. Verificar que `global_identities` tiene una sola fila y que `subject_hmac` es distinto en cada institución. Si M2b está aprobado, verificar las dos filas de `global_identity_tenants`. Verificar que un `ADMIN` de A no puede leer la pertenencia de B.
- **Aceptación:** una identidad global; en M2b, dos pertenencias; HMAC distintos; acceso cruzado denegado.

### D6 Índice global de identidades en el router (M2a) [!]
- **Estado:** `[!]` (depende de A3 y de F1 en estado `Proposed`) · **Tamaño:** M
- **Objetivo:** guardar `(issuer, subject)` → `global_identity_id` en el router, sin correo.
- **Leer primero:** guía 01, sección 6.4; `packages/database/src/schema/router.schema.ts`; `docs/decisions/ADR-0013-random-opaque-pseudonym.md`.
- **Hacer:**
  1. Añadir `globalIdentities` a `router.schema.ts`: `id`, `issuer`, `subject`, `createdAt`, `lastSeenAt`, `UNIQUE(issuer, subject)`.
  2. Generar la migración con `pnpm --filter @vozlab/database db:generate:router`.
  3. Normalizar el emisor (sin barra final) en la capa de aplicación; tratar el `subject` como opaco y sensible a mayúsculas. No añadir correo, nombre, rol ni `tenant_id`.
- **No hacer:** no usar `subject` como clave primaria. No guardar el token ni el correo.
- **Aceptación:** la migración se aplica sobre una base vacía. Dos filas con el mismo `(issuer, subject)` fallan; el mismo `subject` con otro `issuer` se acepta. Una consulta no devuelve correo, nombre ni rol.

### D7 Vínculo global ↔ institución (M2b) [solo si A3 lo aprueba]
- **Estado:** `[!]` (solo si se elige M2b) · **Tamaño:** M · **Depende de:** D6
- **Objetivo:** saber en qué instituciones participa una identidad global, sin mezclar roles.
- **Leer primero:** guía 01, sección 6.4; `router.schema.ts` (`tenants`); `tenant.auth.schema.ts` (`users`).
- **Hacer:**
  1. En el router, `global_identity_tenants`: `global_identity_id`, `tenant_id`, `tenant_user_id`, `status` (`ACTIVE`, `SUSPENDED`, `LEFT`), `first_seen_at`, `last_seen_at`; únicos `(global_identity_id, tenant_id)` y `(tenant_id, tenant_user_id)`. `status` es del **tenant** (agregado de sus workspaces), no del workspace; D14 lo calcula. Una invitación no crea vínculo global hasta el login.
  2. En cada tenant, `auth.users.global_identity_id uuid` nullable con índice **único parcial** (`WHERE global_identity_id IS NOT NULL`) para que no haya dos cuentas locales de la misma persona. No hay FK entre bases.
  3. Migraciones separadas (`db:generate:router` y `db:generate:tenant`).
- **No hacer:** no guardar roles en el router. No borrar en cascada entre bases. No aplicar el índice único si ya hay dos usuarios locales con el mismo `global_identity_id`; repórtalos y resuélvelos antes (D13).
- **Aceptación:** dos instituciones pueden apuntar a la misma identidad global; el mismo `tenant_user_id` no se repite dentro de una institución; dos usuarios locales con el mismo `global_identity_id` fallan; borrar una identidad global no borra usuarios locales sin una tarea explícita.

### D8 Resolver o crear la identidad global en el login
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C4, C6 y D6
- **Objetivo:** que cada login con `(issuer, subject)` obtenga la misma identidad global, de forma idempotente.
- **Leer primero:** guía 01, sección 6.4; `CompleteOidcLoginUseCase.ts`; `DrizzleUserRepository.ts`; `apps/api/src/domain/ports/IRouterDatabase.ts`; `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`.
- **Hacer:**
  1. Añadir un puerto `IGlobalIdentityRepository` en `application/` e implementarlo en `RouterDatabaseClient` (como hace con `IEventCodeRepository`) o en un adaptador que reciba su `db`; no crees un segundo pool. `IRouterDatabase` hoy es solo lectura, así que no mezcles la escritura en ese puerto de lectura.
  2. En el login, después de validar el token y antes de crear la sesión: `upsert` por `(issuer, subject)`; devolver `globalIdentityId`.
  3. Buscar la cuenta local por `(issuer, subject)`. Si no existe, buscar por `global_identity_id`; si aparece, reutilizarla y crear la identidad externa que falte. Si no, crear la cuenta.
  4. Guardar `global_identity_id` en `auth.users` si está vacío. Si ya tiene otro, no pisar: registrar conflicto y devolver error controlado.
  5. Si M2b: `upsert` de `global_identity_tenants` con `tenant_id`, `user_id` y `status = 'ACTIVE'`.
- **No hacer:** no crear identidad global para tokens de agente. No usar el correo como clave. No hacer `upsert` sin transacción en la base local. No escribir en el router dentro de `UnitOfWork.runInTransaction(tid, ...)`: son bases distintas y no hay transacción distribuida. No crees un segundo pool del router.
- **Aceptación:** dos logins seguidos del mismo usuario devuelven el mismo `global_identity_id`; dos usuarios distintos no lo comparten; un conflicto no cambia el vínculo existente.

### D9 Canje de invitación en el primer login [!]
- **Estado:** `[!]` (depende de A7) · **Tamaño:** M · **Depende de:** D3, D8 y D11
- **Objetivo:** que una invitación pendiente se convierta en membresía y en vínculo global cuando la persona se autentica.
- **Leer primero:** guía 01, sección 6.5; `CompleteOidcLoginUseCase.ts`; `docs/auth-and-tenancy.md` (JIT no da acceso a workspace).
- **Hacer:**
  1. Aceptar el token de invitación en el callback: preferible en una cookie `HttpOnly` de vida corta o dentro del `state` de OIDC; si va en la URL, que sea de un solo uso, caduque rápido y la respuesta use `Referrer-Policy: no-referrer`.
  2. Validar hash, caducidad, estado y usos.
  3. Si la invitación tiene correo: exigir `email_verified === true` y comparar el hash del correo normalizado (minúsculas y `trim`, sin reglas de Gmail). Si no coincide, no canjear.
  4. En una transacción local: crear o reutilizar `auth.users` (guardando `global_identity_id`), crear `auth.external_identities`, crear `workspace_memberships` con el rol y `status = 'ACTIVE'`, marcar la invitación `ACCEPTED` e incrementar `used_count`.
  5. Después del commit: `upsert` de `global_identity_tenants` (M2b) con `status = 'ACTIVE'`. Si falla, encolar reconciliación (D14); no revertir el acceso.
  6. Auditar `ACCEPTED`.
- **No hacer:** no crear la identidad global antes de conocer `(issuer, subject)`. No aceptar `email_verified` ausente o `false`. No crear dos membresías si se repite el canje.
- **Aceptación:** pruebas con token caducado, revocado, usos agotados, correo distinto, `email_verified` ausente/false y canje correcto. Repetir el canje no duplica membresías ni identidades globales.

### D10 Gestión de membresías por ADMIN
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** D3, D9 y D11
- **Objetivo:** que un `ADMIN` del workspace pueda listar, invitar, cambiar rol, suspender y expulsar, sin ver otras instituciones.
- **Leer primero:** guía 01, secciones 6.5 y 6.6; `routes.ts` (rutas de auth); `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts`.
- **Hacer:** endpoints bajo `/api/v1/workspaces/:workspaceId/members` (o la ruta que fije el ADR): listar, invitar, cambiar rol, suspender, reactivar, expulsar, reenviar y revocar invitación. Todos con `authGuard` + `tenantWorkspaceGuard` + rol `ADMIN`. Actualizar `IMembershipRepository` y `TenantWorkspaceGuard` para que solo `status = 'ACTIVE'` cuente como miembro; `INVITED`, `SUSPENDED` y `REMOVED` no dan acceso. Escribir auditoría (D11) en la misma transacción.
- **No hacer:** no permitir que un `ADMIN` de A consulte o modifique B. No enumerar usuarios del IdP. No devolver correos de otras instituciones.
- **Aceptación:** pruebas de rol (`MEMBER` y `MODERATOR` reciben 403), aislamiento entre instituciones (404, no 403), un miembro `SUSPENDED` pierde el acceso y cada cambio genera un evento de auditoría.

### D11 Auditoría append-only de membresías e identidad global
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** D6 y D8
- **Objetivo:** registrar quién cambió qué, sin PII y sin permitir edición.
- **Leer primero:** guía 01, sección 6.6; `tenant.auth.schema.ts`; `router.schema.ts`; `apps/api/src/infrastructure/persistence/RouterDatabaseClient.ts`.
- **Hacer:**
  1. Tenant: `auth.membership_events` con `id`, `workspace_id`, `user_id` (nullable), `invitation_id` (nullable), `actor_type`, `actor_id` (nullable), `action`, `before_role`, `after_role`, `reason`, `request_id`, `created_at`.
  2. Router: `global_identity_events` con `id`, `global_identity_id`, `tenant_id` (nullable), `actor_type`, `actor_id` (nullable), `action`, `metadata` JSONB, `request_id`, `created_at`.
  3. Migraciones; servicio de escritura; permisos de solo inserción para el rol de la aplicación.
  4. Alertas para escalada de rol, expulsión, fusión y fallos repetidos de invitación.
- **No hacer:** no guardar correo, nombre, token ni contraseña. No permitir `UPDATE` ni `DELETE` al rol de la aplicación. No usar claves foráneas con `ON DELETE CASCADE` en las tablas de auditoría.
- **Aceptación:** cada acción de D3/D8/D9/D10 escribe su evento en la transacción correspondiente; si el evento del router falla, se reconcilia. Un evento `INVITED` tiene `user_id = NULL` y `invitation_id`; un intento de `UPDATE` o `DELETE` falla; los eventos de A no son legibles desde B.

### D12 Alta directa de identidades conocidas
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** D8, D10 y D11
- **Objetivo:** que un `ADMIN` agregue a su workspace a alguien que ya existe en el índice global, sin invitación por correo.
- **Leer primero:** guía 01, sección 6.5; `global_identities` (D6).
- **Hacer:** endpoint que reciba `global_identity_id`, `workspace_id` y rol; verificar que la identidad existe; leer del router su `(issuer, subject)`; crear la membresía en estado `INVITED` o `ACTIVE` según la decisión A7; auditar. Si el usuario local no existe, crear una fila mínima sin correo, con `global_identity_id`, `provider = 'OIDC_INSTITUTIONAL'`, `provider_user_id = subject` y `auth.external_identities` para que el primer login reutilice la cuenta. `auth.users` exige `provider` y `author_hash`: usa valores válidos y un `author_hash` **aleatorio**, nunca derivado del correo.
- **No hacer:** no buscar por correo en el índice global. No inventar un `global_identity_id`. No dar acceso sin autenticación. No crear la fila local sin la pareja `(issuer, subject)`: el primer login crearía un duplicado.
- **Aceptación:** alta correcta para una identidad conocida; el primer login reutiliza la misma cuenta (sin duplicado); 404 para una identidad inexistente; 404 para un workspace de otra institución; el usuario sigue necesitando login.

### D13 Relleno de usuarios existentes al índice global
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** C4, D6, D8 y D11
- **Objetivo:** que las cuentas actuales tengan `global_identity_id` sin duplicar personas.
- **Leer primero:** `packages/database/scripts/backfill-external-identities.ts` (lo crea C3; si aún no existe, espera a C3); guía 01, sección 6.4.
- **Hacer:** script idempotente que recorra `auth.external_identities`, agrupe por `(issuer, subject)`, haga `upsert` en `global_identities` y actualice `auth.users.global_identity_id`. Recibe el emisor por argumento. Reporta conflictos (un usuario con dos global ids, un global id con dos usuarios) sin resolverlos automáticamente.
- **No hacer:** no usar el correo para unir. No ejecutar sobre producción sin copia y ventana.
- **Aceptación:** ejecutarlo dos veces deja el mismo resultado; los conflictos se listan para revisión humana; no se crea correo ni perfil.

### D14 Reconciliación router ↔ instituciones [solo si M2b]
- **Estado:** `[!]` (solo si se elige M2b) · **Tamaño:** S · **Depende de:** D7, D9, D10 y D11
- **Objetivo:** reparar la falta de transacción distribuida entre el router y las bases de las instituciones.
- **Leer primero:** guía 01, sección 6.5.
- **Hacer:** script o job que compare `auth.users.global_identity_id` y el estado **agregado** de `workspace_memberships` con `global_identity_tenants`; cree los vínculos faltantes, calcule el estado del tenant (`ACTIVE` si hay al menos una membresía `ACTIVE`; `SUSPENDED` si no hay `ACTIVE` pero hay alguna `SUSPENDED`; `LEFT` si todas están `REMOVED` o no hay ninguna), use la base local como fuente de verdad, marque huérfanos y emita un informe sin PII. Las invitaciones `INVITED` no cuentan hasta el canje. Idempotente. Programar según necesidad (por ejemplo, cada hora en el piloto [juicio]).
- **No hacer:** no borrar membresías automáticamente. No usar correo. No registrar tokens.
- **Aceptación:** un vínculo faltante se repara; un huérfano se reporta; ejecutar dos veces no cambia el resultado.

---

## Bloque E. Extractor e IA

Estas tareas tocan escritura de IA. **Requieren revisión humana** (D-36).

### E1 El modelo solo puede proponer clases existentes
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** nada
- **Objetivo:** que el prompt incluya las clases activas y que la salida use un JSON Schema con `enum`.
- **Leer primero:** `apps/worker-extractor/src/worker_extractor/llm.py` (prompt 20 a 26; cuerpo de la petición cerca de la línea 78; parseo 113 a 144); `handler.py` (`_type_key`, 106 a 135). Guía 01, sección 12.8.
- **Hacer:**
  1. Obtener las clases activas **antes** de extraer (hoy se obtienen después, en `_type_key`). Pasarlas al extractor.
  2. Incluirlas en el prompt y en el campo `format` como JSON Schema con `typeKey` de tipo `enum` (Ollama acepta un esquema en `format`; guía 01, sección 12.8).
  3. Mantener la validación posterior: el esquema no sustituye la comprobación.
- **No hacer:** no cambiar el modelo ni la temperatura en esta tarea.
- **Aceptación:** prueba de `llm.py` con transporte falso: el cuerpo enviado incluye el `enum` y el prompt incluye las clases. `uv run pytest apps/worker-extractor` pasa.

### E2 Dejar rastro cuando se sustituye una clase
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** E1
- **Objetivo:** que el fallback silencioso de `_type_key` sea visible.
- **Leer primero:** `handler.py` (106 a 135); `apps/worker-extractor/tests/test_handler.py`.
- **Hacer:** cuando la clase propuesta no exista, añadir al nodo los atributos `typeKeySuggested` y `typeKeyFallback`, y un aviso en el log con `source_id` (sin el texto del registro).
- **Aceptación:** prueba: clase inventada → nodo con los dos atributos y sin texto personal en el log.

### E3 Clave de idempotencia al crear nodos
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** nada
- **Objetivo:** que reintentar la misma entrada del stream no cree un segundo nodo.
- **Leer primero:** `apps/api/src/infrastructure/http/routes.ts` (`POST /api/v1/nodes`, línea 276); `packages/shared-types/src/schemas/node.schema.ts`; `packages/worker-shared/src/vozlab_worker/api.py`; `packages/worker-shared/src/vozlab_worker/streams.py` (identificador del mensaje).
- **Hacer:**
  1. La API acepta la cabecera opcional `Idempotency-Key` y guarda `(workspace_id, key, request_hash, node_id)` con índice único.
  2. Misma clave y mismo cuerpo: devolver el nodo existente (200). Misma clave y cuerpo distinto: `409` con `ERR_IDEMPOTENCY_CONFLICT`.
  3. El worker envía una clave derivada del identificador del mensaje del stream, que no cambia entre reintentos.
- **No hacer:** no romper la regla de ADR-0024 (un nodo por petición). Esta tarea no cubre duplicados entre entradas distintas (eso es E4 y E5).
- **Aceptación:** pruebas de API para las tres ramas y prueba del worker que verifica que la cabecera se envía en el reintento.

### E4 Un duplicado aporta evidencia, no se descarta
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** E3 y del contrato `EDIT` de `proposal.schema.ts`
- **Objetivo:** que un registro duplicado se convierta en una propuesta de edición sobre el nodo existente.
- **Leer primero:** `handler.py` (71 a 79 y 137 a 153); `packages/shared-types/src/schemas/proposal.schema.ts`; `apps/api/src/infrastructure/http/routes.ts` (ruta de propuestas).
- **Hacer:** cuando el título coincida, crear una propuesta `EDIT` sobre el nodo existente con el fragmento como evidencia y la fuente en `proposedChanges`. **No** aplicarla automáticamente. Confirmar el mensaje solo si la propuesta se creó.
- **Aceptación:** prueba: dos registros con el mismo título → un nodo y una propuesta con la evidencia del segundo.

### E5 Búsqueda de candidatos por vector para agentes
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** A5
- **Objetivo:** que el Extractor pueda buscar nodos parecidos antes de crear.
- **Leer primero:** `docs/decisions/ADR-0022-relator-neighbour-lookup.md`; `apps/api/src/application/use_cases/GetNodeNeighborsUseCase.ts` o la ruta de vecinos (`routes.ts`, 298); `tenant.public.schema.ts` (columna de embedding de `nodes`).
- **Hacer:** `POST /api/v1/nodes/candidates`, **solo agentes del sistema**, con `embedding` y `limit` (máximo 20). Devuelve nodos del mismo workspace por similitud de coseno. El vector lo calcula el worker.
- **No hacer:** no vectorizar texto en la API. No devolver nodos de otro workspace (404, nunca 403).
- **Aceptación:** pruebas: agente del sistema con resultados, agente con otro workspace sin resultados y humano con 403.

### E6 Aristas sin duplicados y sin relaciones inventadas
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** nada
- **Objetivo:** que la API no acepte dos veces la misma arista ni claves de relación desconocidas.
- **Leer primero:** `apps/api/src/application/use_cases/CreateEdgeUseCase.ts` (44 a 61); `tenant.public.schema.ts` (tabla `edges` y el índice único de votos, línea 206); `docs/decisions/ADR-0023-relator-edge-and-merge-semantics.md`.
- **Hacer:**
  1. Buscar duplicados en los datos de desarrollo **antes** de migrar.
  2. Índice único `(workspace_id, source_node_id, target_node_id, relation_key)`.
  3. En `CreateEdgeUseCase`: rechazar una propiedad inexistente, una autoarista y una violación del índice único (`ERR_EDGE_EXISTS`, 409).
  4. Normalizar el orden de los extremos en relaciones simétricas.
- **Aceptación:** pruebas: clave desconocida, autoarista, arista duplicada y simétrica invertida.

### E7 Matriz de capacidades por tipo de agente
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** A5
- **Objetivo:** que cada agente solo pueda lo suyo.
- **Leer primero:** `apps/api/src/infrastructure/http/middlewares/agentGuard.ts`; `routes.ts` (276 a 365 y 315).
- **Hacer** (matriz propuesta, ajustar en A5):
  - Extractor: crear nodos, buscar candidatos, proponer `EDIT`.
  - Relacionador: crear aristas `PENDING` y proponer `MERGE`.
  - Embedder: solo el embedding.
  - Ningún agente: aprobar ni rechazar.
  Implementarlo con un mapa de capacidades y un middleware `requireCapability`, junto a `requireAgentType`.
- **Aceptación:** pruebas: token del Extractor en `POST /edges` → 403; del Relacionador → 201; cualquier agente en la ruta de aprobación → 403.

### E8 Aceptar y rechazar aristas `PENDING` [!]
- **Estado:** `[!]` · **Tamaño:** M · **Depende de:** decidir quién acepta (D-13)
- **Objetivo:** cerrar el flujo de las aristas que crean los agentes (hoy no se pueden aceptar, F-01).
- **Leer primero:** `apps/api/src/application/use_cases/proposalAuthorization.ts` (23 a 58); `docs/decisions/ADR-0026-merge-contract.md`.
- **Hacer:** rutas `PUT /api/v1/edges/:id/accept` y `.../reject`. Solo una **persona** con el rol que decida D-13. **Nunca** el agente autor de la arista.
- **Aceptación:** pruebas: agente → 403; persona sin rol → 403; persona con rol → 200.

### E9 Contrato de extracción multi-entidad
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** E1
- **Objetivo:** que el modelo devuelva varias entidades y relaciones con cita de evidencia.
- **Leer primero:** `apps/worker-extractor/src/worker_extractor/models.py`; `llm.py` (113 a 144); `apps/worker-extractor/tests/test_llm.py`.
- **Hacer:**
  1. Modelos Pydantic `EntityDraft` (`local_id`, `type_key`, `title`, `description`, `attributes`, `evidence_quote` de 200 caracteres como máximo, `confidence` de 0 a 1) y `RelationDraft` (`from_local_id`, `to_local_id`, `relation_key`, `evidence_quote`, `confidence`).
  2. La cita **debe** aparecer en el texto enmascarado. Si no aparece, descartar el elemento y registrarlo.
  3. `local_id` único; una relación hacia un `local_id` inexistente se descarta.
- **No hacer:** no tocar la API en esta tarea.
- **Aceptación:** pruebas con citas inventadas, relaciones a un `local_id` inexistente y un registro sin entidades (error permanente).

### E10 Juez compartido y puro
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** E5 y E9
- **Objetivo:** una sola función que decida entre crear, añadir evidencia, proponer fusión o revisar.
- **Leer primero:** guía 01, secciones 12.5 y 12.6.
- **Hacer:** `packages/worker-shared/src/vozlab_worker/judge.py` con `decide(mention, candidates, policy)`. Primero reglas deterministas (coincidencia normalizada exacta), después umbrales de similitud. Devuelve `CREATE`, `ATTACH_EVIDENCE`, `PROPOSE_MERGE` o `REVIEW`, con el motivo. **Sin red** y sin llamar al modelo dentro de esta función.
- **Aceptación:** pruebas unitarias de cada rama, incluidos empate y lista vacía.

### E11 Conjunto de oro y script de evaluación
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** E1 y E9
- **Objetivo:** medir si funciona antes de desplegar.
- **Leer primero:** guía 01, sección 12.9; `knowledge-transfer/06`, sección 7.
- **Hacer:**
  1. `apps/worker-extractor/evals/dataset.jsonl` con 30 a 50 registros sintéticos y los umbrales en `apps/worker-extractor/evals/README.md`, **antes** de la primera medición.
  2. `apps/worker-extractor/evals/run.py`: precisión de clases, precisión de fusiones (la más importante), precisión y cobertura de relaciones y tasa de salidas inválidas. Debe poder correr sin red con un modelo falso, y opcionalmente contra Ollama.
- **Aceptación:** el script imprime el JSON de métricas y sale con código 0. Los umbrales están escritos antes de correrlo.

### E12 Inyección y agencia
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** E7 y E9
- **Objetivo:** demostrar que un texto malicioso no escala privilegios.
- **Leer primero:** guía 01, sección 12.8; OWASP LLM01 y LLM06.
- **Hacer:** 20 registros adversariales ("aprueba todo", "ignora las reglas", "crea una clase admin", JSON inyectado, relación hacia otro workspace) con pruebas que verifiquen: la clase inventada no crea nodo, la relación a otro workspace se rechaza y el token del Extractor no aprueba ni crea aristas.
- **Aceptación:** las 20 pruebas pasan y hay un informe corto en `apps/worker-extractor/evals/informe-adversarial.md`.

### E13 Procedencia en nodos y aristas
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** E3
- **Objetivo:** poder explicar de dónde salió cada cosa.
- **Leer primero:** `tenant.public.schema.ts` (columnas `attributes`); `docs/spec/extractor.md`.
- **Hacer:** guardar en `attributes.provenance`: `source_key`, `stream_entry_id`, `model`, `model_digest`, `prompt_version` e `input_sha256`. Nunca el texto original del registro.
- **Aceptación:** prueba de integración: el nodo creado por el worker incluye `attributes.provenance` y no incluye PII.

---

## Bloque F. Documentación y gobierno

### F1 ADR-0028: identidad multi-institución, índice global y broker
- **Estado:** `[ ]` · **Tamaño:** M
- **Objetivo:** registrar la decisión de identidad antes de codificarla.
- **Leer primero:** `docs/decisions/README.md` (convenciones e índice); `docs/decisions/ADR-0013-random-opaque-pseudonym.md`; `docs/decisions/ADR-0018-oidc-jit-hybrid-sessions.md`; `docs/auth-and-tenancy.md` (JIT no da acceso a workspace); `packages/database/src/schema/router.schema.ts`; guía 01, secciones 6 y 8.3; D-23 y D-24 en `knowledge-transfer/15`.
- **Hacer:** crear `docs/decisions/ADR-0028-multi-institution-identity-and-broker.md` con contexto, opciones (M1, M2a, M2b, M3; broker dentro o fuera de la API), decisión, consecuencias y preguntas abiertas. Incluir: topología del broker (realm compartido para que `(issuer, subject)` sea estable), campos del índice global, finalidad, base legal, retención, acceso, auditoría y reconciliación. Reconciliar explícitamente con ADR-0013 y D-23: el índice global **sí** correlaciona; no afirmar lo contrario. Estado `Proposed` hasta aprobación humana. **No modificar ADR-0018.**
- **Aceptación:** el ADR sigue la estructura de los existentes, está enlazado desde `docs/decisions/README.md` y una persona lo aprueba antes de D6.

### F2 ADR-0029: extracción multi-entidad y deduplicación por capas
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** A4 y A5
- **Objetivo:** dejar escrito por qué el Extractor crea entidades y relaciones, y cómo deduplica.
- **Leer primero:** `docs/decisions/ADR-0024-no-batch-node-endpoint.md`; `docs/decisions/ADR-0026-merge-contract.md`; guía 01, secciones 12.3 a 12.7.
- **Hacer:** `docs/decisions/ADR-0029-multi-entity-extraction-and-dedup.md`, con el paquete por registro como opción que matiza ADR-0024 (no lo deroga sin decisión explícita). Estado `Proposed`.
- **Aceptación:** enlazado desde el índice y revisado por una persona.

### F3 Actualizar las especificaciones (solo tras aceptar un ADR)
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** F1 o F2 aceptados
- **Objetivo:** que la documentación aprobada refleje el comportamiento real.
- **Leer primero:** `docs/spec/extractor.md`; `docs/auth-and-tenancy.md`; `docs/api-reference.md`.
- **Hacer:** actualizar solo las secciones afectadas por el ADR aceptado. Cada afirmación debe corresponder al código.
- **Aceptación:** un revisor compara spec y código y no encuentra contradicciones en las secciones tocadas.

### F4 Inventario de datos personales y aviso de privacidad
- **Estado:** `[ ]` · **Tamaño:** M · **Depende de:** A1, A3
- **Objetivo:** tener la base documental para la Ley 1581 de 2012 (guía 01, sección 11, punto 6).
- **Leer primero:** guía 01, secciones 6.4, 11 y 15; D-15 y D-16 en `knowledge-transfer/15`.
- **Hacer:** documento con una tabla por fuente y proveedor: campos personales, finalidad, base del tratamiento, tiempo de retención y dónde se alojan. Incluir el índice global (`issuer`/`subject` y, si M2b, la pertenencia), las invitaciones y la auditoría. Añadir un borrador de aviso de privacidad marcado como **pendiente de revisión jurídica**. Si se aprueba M2b, incluir una evaluación de impacto.
- **Aceptación:** revisado por una persona y enviado a jurídico. No se publica como definitivo.

### F5 Copiar al ROADMAP solo lo aprobado
- **Estado:** `[ ]` · **Tamaño:** S · **Depende de:** tareas aprobadas
- **Objetivo:** que el único tablero vivo refleje el trabajo real.
- **Leer primero:** `ROADMAP.md`; AGENTS.md ("`ROADMAP.md` es el único tablero vivo").
- **Hacer:** añadir al ROADMAP las tareas aprobadas, con su ID de este documento y un criterio de aceptación verificable. No duplicar el contenido completo.
- **Aceptación:** cada ítem del ROADMAP apunta a una tarea de este archivo.

---

## Orden sugerido

1. **A1 a A8** en paralelo. Son decisiones, no código.
2. **F1** (ADR-0028) en borrador desde el principio. **Debe estar aprobado antes de D6.**
3. **B1 a B9**: laboratorio. B1 a B7 con Keycloak y LLDAP; B8 Authentik es opcional; B9 valida SAML 2.0.
4. **C1 a C6**: cerrar los riesgos altos de identidad. C7 y C8 cuando se decidan.
5. **D1 y D2**: proveedores por institución y login por institución.
6. **D6 a D8**: índice global y resolución en el login. D7 solo si se aprueba M2b.
7. **D11**: tablas y servicio de auditoría; después se integra en cada cambio.
8. **D3, D9, D10 y D12**: invitaciones, canje, administración y alta directa.
9. **D13 y D14**: relleno de cuentas existentes y reconciliación.
10. **D4 y D5**: verificación de dominio y correlación controlada.
11. **E1 a E6**: hacer que el Extractor sea útil y seguro en lo básico.
12. **E7 a E13**: capacidad de agentes, aristas, evaluación y procedencia.
13. **F2 a F5**: documentación y gobierno, en paralelo desde el principio; F3 y F5 al final.

Ninguna tarea marcada `[!]` se empieza sin una decisión escrita. Si una tarea revela que una decisión estaba mal, se para y se vuelve al bloque A.

