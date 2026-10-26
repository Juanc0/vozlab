# Authentik vs. Zitadel — Comparación profunda para VozLab

> Análisis detallado para decidir el reemplazo de Keycloak.
> Complementa [identity-broker-comparison.md](identity-broker-comparison.md).
> Fecha: 2026-10-26.

## 1. Resumen ejecutivo

| Aspecto | Authentik | Zitadel |
|---|---|---|
| **Lenguaje** | Python (Django) + Go (outposts) | Go |
| **Licencia core** | MIT (core) + Enterprise (EE) de pago | Apache 2.0 (core) + BSL (enterprise) |
| **Modelo de negocio** | Open core: features avanzadas son EE (pago) | Open core: features enterprise son BSL (pago, con restricción de uso) |
| **Peso** | ~300MB imagen, ~512MB-1GB RAM | ~50MB imagen, ~128-256MB RAM |
| **Multi-tenant** | Tenants (desde 2023) | Organizaciones (nativas, primer nivel) |
| **SAML 2.0** | ✅ Core (básico) + EE (avanzado: attribute mapping, ECP) | ✅ Core (reciente, 2024) |
| **LDAP** | ✅ (outpost LDAP, bidireccional) | ⚠️ (no nativo; via actions o SCIM) |
| **OIDC** | ✅ Completo | ✅ Completo |
| **MFA** | TOTP, WebAuthn, SMS, email, Duo, static | TOTP, WebAuthn, push, OTP |
| **Admin UI** | Excelente (React, flows visuales) | Buena (React/Next.js) |
| **Audit logs** | Sí (eventos) | Sí (event sourcing, completo) |
| **Arranque** | 5-10s | 2-5s |
| **Madurez** | Media (2018, ~6 años) | Media-baja (2019, ~5 años, pero menos battle-testing) |
| **Backing** | goauthentik (startup VC) | Zitadel Inc. (startup VC) |
| **Riesgo de abandono** | Medio | Medio-bajo |

**Veredicto rápido:** Authentik es mejor si necesitas LDAP nativo y una UI madura. Zitadel es mejor si necesitas multi-tenancy nativo y peso mínimo. Ambos tienen features de pago que pueden ser un problema.

---

## 2. Arquitectura interna

### 2.1 Authentik

```
┌─────────────────────────────────────────────────┐
│                  Authentik                       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Server   │  │ Worker   │  │ Outpost      │  │
│  │ (Django) │  │ (Celery) │  │ (Go binary)  │  │
│  │          │  │          │  │              │  │
│  │ - Admin  │  │ - Tasks  │  │ - LDAP proxy │  │
│  │   UI     │  │ - Email  │  │ - Proxy      │  │
│  │ - API    │  │ - Webhook│  │ - RADIUS     │  │
│  │ - Flows  │  │          │  │              │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │             │               │           │
│       └──────┬──────┴───────────────┘           │
│              │                                   │
│       ┌──────┴──────┐                           │
│       │ PostgreSQL  │ (requerido)               │
│       │ + Redis     │ (requerido)               │
│       └─────────────┘                           │
└─────────────────────────────────────────────────┘
```

**Componentes:**
- **Server (Django):** Admin UI, API REST, motor de flujos (flows), autenticación.
- **Worker (Celery):** Tareas asíncronas (emails, webhooks, limpieza).
- **Outpost (Go):** Proxy LDAP, reverse proxy, RADIUS. Se despliega junto al server o como sidecar.
- **PostgreSQL:** Base de datos (requerido).
- **Redis:** Cache y cola de tareas (requerido).

**Implicación:** Authentik requiere **5 procesos** (server, worker, outpost, PostgreSQL, Redis). Es más componentes que Keycloak (que solo necesita PostgreSQL).

### 2.2 Zitadel

```
┌─────────────────────────────────────────────┐
│                Zitadel                        │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         Zitadel Server (Go)          │   │
│  │                                      │   │
│  │  - Admin UI (React/Next.js)          │   │
│  │  - API (gRPC + REST)                 │   │
│  │  - Auth flows                        │   │
│  │  - Event store (event sourcing)      │   │
│  │  - Actions (JavaScript)              │   │
│  │                                      │   │
│  └──────────────┬───────────────────────┘   │
│                 │                            │
│        ┌────────┴────────┐                  │
│        │  PostgreSQL     │ (o CockroachDB)  │
│        │  (requerido)    │                  │
│        └─────────────────┘                  │
└─────────────────────────────────────────────┘
```

**Componentes:**
- **Zitadel Server (Go):** Todo en un solo binario — admin UI, API, auth flows, event store, actions.
- **PostgreSQL (o CockroachDB):** Base de datos (requerido). No necesita Redis.

**Implicación:** Zitadel requiere **2 procesos** (server + DB). Mucho más simple operativamente que Authentik.

---

## 3. Protocolos y features — qué es gratis vs. de pago

Esta es la preocupación principal del usuario: **licencias extendidas para protocolos futuros**.

### 3.1 Authentik — features gratuitas vs. Enterprise (EE)

| Feature | Core (gratis, MIT) | Enterprise (EE, pago) |
|---|---|---|
| OIDC (authorization code, PKCE, etc.) | ✅ | — |
| SAML 2.0 (básico) | ✅ | — |
| SAML 2.0 (avanzado: ECP, attribute mapping complejo, metadata auto-refresh) | ❌ | ✅ |
| LDAP outpost (proxy LDAP) | ✅ | — |
| LDAP (bidireccional, sync) | ✅ | — |
| Social login (Google, GitHub, Microsoft, etc.) | ✅ | — |
| MFA (TOTP, WebAuthn, SMS, email, Duo) | ✅ (TOTP, WebAuthn, static) | ✅ (SMS, email, Duo, push) |
| Flows visuales (editor drag-and-drop) | ✅ | — |
| Claims mapping (property mappings) | ✅ | — |
| Brute-force protection | ✅ | — |
| Session management | ✅ | — |
| Audit logs (eventos) | ✅ | ✅ (avanzados: export, SIEM integration) |
| Multi-tenant (tenants) | ✅ | ✅ (avanzado: branding por tenant, políticas por tenant) |
| SCIM provisioning | ❌ | ✅ |
| RADIUS | ❌ | ✅ |
| App launcher (portal de apps) | ✅ | ✅ (avanzado) |
| GeoIP / risk-based auth | ❌ | ✅ |
| Custom branding (logo, colores por tenant) | ⚠️ (básico) | ✅ (completo) |
| Soporte comercial | ❌ | ✅ |

**Costo EE:** ~$5/usuario/mes (según el sitio de Authentik, pricing por MAU). Para 10.000 MAU → ~$50.000/mes. Para un proyecto universitario, esto es prohibitivo.

**Riesgo para VozLab:** Si en el futuro necesitamos SCIM (provisioning automático de usuarios desde el directorio de la universidad), SAML avanzado, o MFA por SMS/email, tendremos que pagar EE. Esto es un riesgo real.

### 3.2 Zitadel — features gratuitas vs. BSL (Business Source License)

| Feature | Core (gratis, Apache 2.0) | BSL (pago, con restricción) |
|---|---|---|
| OIDC (authorization code, PKCE, etc.) | ✅ | — |
| SAML 2.0 | ✅ (core, desde 2024) | — |
| LDAP | ❌ (no nativo) | ❌ (no disponible ni en BSL) |
| Social login (Google, GitHub, Microsoft, Apple) | ✅ | — |
| MFA (TOTP, WebAuthn) | ✅ | — |
| MFA (push, SMS) | ❌ | ✅ (BSL) |
| Actions (JavaScript en flujos) | ✅ | — |
| Event sourcing (audit log completo) | ✅ | — |
| Multi-tenant (organizaciones) | ✅ | — |
| Claims mapping | ✅ (via actions) | — |
| Brute-force protection | ✅ | — |
| Session management | ✅ | — |
| Custom branding | ⚠️ (básico) | ✅ (BSL: branding completo por org) |
| SCIM provisioning | ❌ | ✅ (BSL) |
| SSO (enterprise SSO) | ❌ | ✅ (BSL) |
| Soporte comercial | ❌ | ✅ |

**Costo BSL:** Zitadel Cloud (SaaS) tiene pricing por MAU. Self-hosted BSL requiere licencia comercial (contactar ventas). No hay pricing público para self-hosted BSL.

**Riesgo para VozLab:** La BSL es más restrictiva que la EE de Authentik. La BSL prohíbe usar las features BSL en producción sin licencia comercial. Si necesitamos SCIM o branding completo, tendremos que pagar. Además, la BSL genera controversia en la comunidad (no es 100% open source).

### 3.3 Comparación de licencias — el punto crítico

| Aspecto | Authentik (MIT + EE) | Zitadel (Apache 2.0 + BSL) |
|---|---|---|---|
| **Core** | MIT (totalmente libre) | Apache 2.0 (totalmente libre) |
| **Enterprise features** | EE (pago, por MAU) | BSL (pago, con restricción de uso) |
| **Puedo usar el core en producción gratis?** | ✅ Sí | ✅ Sí |
| **Puedo modificar el core?** | ✅ Sí (MIT) | ✅ Sí (Apache 2.0) |
| **Puedo redistribuir el core?** | ✅ Sí | ✅ Sí |
| **Las features de pago son "open source"?** | ❌ No (código cerrado) | ⚠️ Sí (código visible pero no usable en prod sin licencia) |
| **Riesgo de vendor lock-in** | Medio (EE features no portables) | Alto (BSL prohíbe uso en prod sin licencia) |
| **Riesgo de cambio de licencia** | Bajo (MIT es irrevocable) | Medio (BSL puede cambiar términos) |

**Punto clave para un arquitecto:**
- **Authentik (MIT)** es más seguro legalmente: el core es MIT (irrevocable, sin restricciones). Las features EE son de pago pero el core nunca cambiará.
- **Zitadel (Apache 2.0 + BSL)** tiene el core libre, pero la BSL es una licencia "source-available" que prohíbe el uso en producción de las features BSL sin licencia comercial. Esto genera incertidumbre legal.

---

## 4. Comparación detallada por dimensión

### 4.1 Protocolos y features

| Protocolo/Feature | Authentik | Zitadel | Keycloak (referencia) |
|---|---|---|---|
| OIDC (authorization code, PKCE, implicit, hybrid) | ✅ Completo | ✅ Completo | ✅ Completo |
| SAML 2.0 (SP-initiated) | ✅ Core | ✅ Core (2024) | ✅ Completo |
| SAML 2.0 (IdP-initiated) | ✅ Core | ✅ Core | ✅ Completo |
| SAML 2.0 (ECP, attribute mapping avanzado) | ❌ EE | ⚠️ Básico | ✅ Completo |
| LDAP (servidor LDAP integrado) | ✅ (outpost) | ❌ | ✅ (federation) |
| LDAP (federation, bind, search) | ✅ (bidireccional) | ❌ (no nativo) | ✅ (completo) |
| Social login (Google, Microsoft, GitHub, etc.) | ✅ | ✅ | ✅ |
| MFA: TOTP | ✅ Core | ✅ Core | ✅ |
| MFA: WebAuthn/FIDO2 | ✅ Core | ✅ Core | ✅ |
| MFA: SMS | ❌ EE | ❌ BSL | ✅ (SPI) |
| MFA: Email OTP | ❌ EE | ❌ BSL | ✅ (SPI) |
| MFA: Push | ❌ EE | ❌ BSL | ⚠️ (SPI) |
| Brute-force protection | ✅ Core | ✅ Core | ✅ |
| Session management | ✅ Core | ✅ Core | ✅ |
| Claims mapping | ✅ Core (property mappings) | ✅ Core (actions/JS) | ✅ (UI + SPI) |
| Home realm discovery | ✅ Core | ✅ Core | ✅ |
| Identity brokering | ✅ Core | ✅ Core | ✅ |
| Account linking | ✅ Core | ✅ Core | ✅ |
| SCIM provisioning | ❌ EE | ❌ BSL | ⚠️ (SPI) |
| Multi-tenant | ✅ Core (tenants) | ✅ Core (orgs nativas) | ⚠️ (realms) |
| Custom branding | ⚠️ Core (básico) | ⚠️ Core (básico) | ✅ (themes) |
| Audit logs | ✅ Core | ✅ Core (event sourcing) | ✅ (events) |
| User self-service (password reset, etc.) | ✅ Core | ✅ Core | ✅ |
| RADIUS | ❌ EE | ❌ | ⚠️ (SPI) |
| GeoIP / risk-based auth | ❌ EE | ❌ | ⚠️ (SPI) |

**Punto clave para VozLab:**
- **LDAP es crítico** para el caso de directorios locales (B2, B3, B5). Authentik lo soporta nativamente (outpost LDAP). Zitadel **no** lo soporta nativamente. Si necesitamos LDAP, Authentik es la mejor opción entre los dos.
- **SAML es crítico** para Entra ID en modo SAML. Ambos lo soportan en core, pero Authentik tiene más madurez en SAML (más años).
- **MFA por SMS/email** es de pago en ambos. Si lo necesitamos, tendremos que pagar o implementar via SPI/custom.

### 4.2 Multi-tenancy (el punto más importante para VozLab)

VozLab es multi-institución. Cada institución tiene sus propios IdPs, claims, branding. Esto es crítico.

| Aspecto | Authentik | Zitadel | Keycloak |
|---|---|---|---|
| **Modelo** | Tenants (desde 2023) | Organizaciones (nativas, primer nivel) | Realms (cada realm = un tenant aislado) |
| **Aislamiento** | Por tenant (IdPs, flujos, branding) | Por organización (IdPs, branding, políticas) | Por realm (todo aislado: users, clients, IdPs) |
| **IdPs por tenant/org** | ✅ | ✅ | ✅ (por realm) |
| **Branding por tenant/org** | ⚠️ (básico en core, completo en EE) | ⚠️ (básico en core, completo en BSL) | ✅ (themes por realm) |
| **Políticas por tenant/org** | ✅ | ✅ | ✅ (por realm) |
| **Usuarios compartidos entre tenants** | ❌ (cada tenant tiene sus propios usuarios) | ✅ (un usuario puede estar en múltiples orgs) | ❌ (cada realm tiene sus propios usuarios) |
| **Escalabilidad (cientos de tenants)** | ⚠️ (tenants son relativamente nuevos) | ✅ (diseñado para esto) | ❌ (realms son pesados, cada uno es una instancia lógica completa) |

**Punto clave para VozLab:**
- **Zitadel tiene el mejor modelo de multi-tenancy** — organizaciones son ciudadanos de primera clase, un usuario puede estar en múltiples orgs, y está diseñado para escalar a cientos de tenants.
- **Keycloak con realms** es pesado: cada realm es una instancia lógica completa con su propia DB schema. A escala (cientos de instituciones) esto es un problema.
- **Authentik con tenants** es intermedio: funciona pero los tenants son relativamente nuevos (2023) y menos battle-tested.

**Para VozLab (multi-institución, potencialmente cientos de universidades):** Zitadel tiene la ventaja arquitectónica. Pero la falta de LDAP nativo es un problema.

### 4.3 LDAP — el punto más crítico para VozLab

VozLab necesita brokerar directorios LDAP locales (LLDAP, OpenLDAP, Samba AD). Esto es un requisito del lab (B2, B3, B5) y potencialmente de producción (universidades con directorios propios).

| Aspecto | Authentik | Zitadel | Keycloak |
|---|---|---|---|
| **LDAP federation (bind + search)** | ✅ Nativo (outpost LDAP) | ❌ No nativo | ✅ Nativo (user federation) |
| **LDAP como servidor (exponer usuarios via LDAP)** | ✅ (outpost LDAP) | ❌ | ❌ |
| **Sincronización bidireccional** | ✅ (outpost) | ❌ (via SCIM, BSL) | ✅ (import/sync) |
| **Mapeo de atributos** | ✅ (property mappings) | N/A | ✅ (mappers) |
| **Modo READ_ONLY / READ_WRITE** | ✅ | N/A | ✅ |
| **User Account Control (disabled users)** | ✅ | N/A | ✅ |

**Punto clave:** Authentik es el único de los dos que soporta LDAP nativamente. Zitadel no tiene LDAP federation. Si una universidad tiene un directorio LDAP (Active Directory, OpenLDAP), Zitadel no puede federarlo directamente. Tendrías que usar SCIM (BSL, de pago) o sincronizar usuarios manualmente.

**Para VozLab:** Si el caso de uso incluye directorios LDAP (que sí incluye, según B2/B3/B5), **Authentik es la mejor opción entre los dos**. Zitadel requeriría una solución alternativa (SCIM o sync manual).

### 4.4 Despliegue y operación

| Aspecto | Authentik | Zitadel |
|---|---|---|
| **Procesos** | 3 (server, worker, outpost) + PostgreSQL + Redis | 1 (server) + PostgreSQL |
| **Imagen Docker** | ~300MB (server) + ~100MB (outpost) | ~50MB |
| **RAM mínimo** | ~512MB (server) + ~128MB (worker) + ~64MB (outpost) + ~256MB (PG) + ~64MB (Redis) = ~1GB total | ~128MB (server) + ~256MB (PG) = ~384MB total |
| **CPU mínimo** | 1-2 cores | 0.5-1 core |
| **Arranque** | 5-10s (server) + 2-3s (worker) + 1-2s (outpost) | 2-5s |
| **Dependencias externas** | PostgreSQL + Redis | PostgreSQL (o CockroachDB) |
| **Backup** | DB dump (PG) + Redis dump | DB dump (PG) |
| **HA / clustering** | ⚠️ Limitado (outpost puede escalar, server/worker con shared DB) | ✅ (CockroachDB para HA, o PG con replication) |
| **Monitoring** | Prometheus (built-in) | Prometheus (built-in) |
| **Logs** | Estructurados (JSON) | Estructurados (JSON) |
| **Actualización** | Docker pull + DB migration (automática) | Docker pull + DB migration (automática) |
| **Helm chart** | ✅ (oficial) | ✅ (oficial) |
| **K8s operator** | ⚠️ (comunidad) | ⚠️ (comunidad) |

**Punto clave para DevOps:**
- **Zitadel es mucho más simple de operar** — un solo binario, una sola DB, sin Redis. Menos componentes = menos puntos de fallo.
- **Authentik es más complejo** — 5 procesos, más componentes. Pero la UI y la funcionalidad son superiores.
- **Para un equipo pequeño:** Zitadel es más fácil de operar. Authentik requiere más conocimiento de Django/Celery.

### 4.5 Seguridad

| Aspecto | Authentik | Zitadel |
|---|---|---|
| **MFA** | TOTP, WebAuthn, SMS, email, Duo, static tokens | TOTP, WebAuthn, push, OTP |
| **Brute-force protection** | ✅ (configurable por flow) | ✅ (configurable por org) |
| **Session management** | ✅ (sesiones por usuario, revocación) | ✅ (sesiones, device management) |
| **Audit logs** | ✅ (eventos, exportable) | ✅ (event sourcing, completo, inmutable) |
| **Rate limiting** | ✅ (built-in) | ✅ (built-in) |
| **CORS / CSP** | ✅ | ✅ |
| **IP allowlisting** | ✅ | ✅ |
| **GeoIP / risk-based auth** | ❌ (EE) | ❌ (BSL) |
| **CVE history** | Pocos, parcheados rápido | Pocos, parcheados rápido |
| **Auditorías de seguridad** | Menos que Keycloak | Menos que Keycloak |
| **Madurez de seguridad** | Media (6 años, pero startup) | Media-baja (5 años, menos battle-testing) |

**Punto clave:** Ambos son menos maduros que Keycloak en seguridad. Authentik tiene más años de producción. Zitadel tiene event sourcing (audit log inmutable por diseño), lo cual es excelente para auditoría.

### 4.6 Comunidad y soporte

| Aspecto | Authentik | Zitadel |
|---|---|---|
| **GitHub stars** | ~15.000 | ~9.000 |
| **Contributors** | ~200 | ~150 |
| **Releases** | Frecuentes (cada 2-4 semanas) | Frecuentes (cada 2-4 semanas) |
| **Docs** | Buenas (mejorando) | Buenas (técnicas) |
| **Stack Overflow** | Pocas preguntas | Pocas preguntas |
| **Discord/Slack** | Discord activo | Discord/Slack activo |
| **Tutoriales** | Medios (YouTube, blogs) | Pocos |
| **Soporte comercial** | ✅ (EE incluye soporte) | ✅ (BSL incluye soporte) |
| **Backing financiero** | VC (goauthentik) | VC (Zitadel Inc.) |

**Punto clave:** Ambos tienen comunidades medianas y crecientes, pero mucho menores que Keycloak. Esto significa menos recursos de troubleshooting y menos tutoriales. Para un equipo pequeño, esto puede ser un problema.

---

## 5. La pregunta: "¿es mejor un mismo IdP que ofrezca varios protocolos?"

**Respuesta corta: Sí, es mejor.** Un solo IdP que ofrece múltiples protocolos (OIDC + SAML + LDAP) es superior a tener IdPs separados por protocolo. Razones:

### 5.1 Normalización

Un solo broker normaliza todos los protocolos a un solo token OIDC hacia el API. Si tuvieras IdPs separados (uno para OIDC, otro para SAML, otro para LDAP), el API tendría que validar tokens de múltiples emisores, con múltiples JWKS, múltiples claims. Con un broker, el API solo confía en un emisor.

### 5.2 Account linking

Un usuario puede autenticarse via Entra (SAML) hoy y via Google (OIDC) mañana. Con un solo broker, se puede vincular ambas identidades a la misma cuenta de VozLab (account linking). Con IdPs separados, esto es mucho más complejo.

### 5.3 Claims mapping centralizado

El broker mapea claims de cada IdP (`tid` de Entra, `hd` de Google, `uid` de LDAP) a un claim canónico (`tid`) que el API consume. Con IdPs separados, cada uno tendría su propio mapping.

### 5.4 MFA centralizado

El broker gestiona MFA (TOTP, WebAuthn) para todos los IdPs. Si un usuario se autentica via LDAP, el broker puede exigir MFA adicional. Con IdPs separados, cada uno maneja su propio MFA.

### 5.5 UX unificada

Un solo broker = una sola pantalla de login, un solo flujo, un solo diseño. Con IdPs separados = múltiples pantallas, múltiples flujos.

### 5.6 Operación simplificada

Un solo servicio que actualizar, monitorear y hacer backup. Con IdPs separados = N servicios, N backups, N monitoreos.

**Excepción:** Si un IdP externo (como Entra ID) ya gestiona MFA y sesiones para toda la organización, puede tener sentido delegar la autenticación a ese IdP y usar el broker solo para normalizar claims. Pero esto es un caso avanzado que requiere que el IdP externo soporte todo lo que necesitas (SAML, OIDC, MFA, etc.).

---

## 6. Matriz de decisión final (Authentik vs. Zitadel para VozLab)

| Criterio (peso) | Authentik | Zitadel | Ganador |
|---|---|---|---|
| LDAP nativo (peso 3) | 15 | 0 | **Authentik** |
| SAML maduro (peso 3) | 12 | 9 | **Authentik** |
| Multi-tenant (peso 3) | 9 | 15 | **Zitadel** |
| Peso/recursos (peso 2) | 6 | 10 | **Zitadel** |
| Madurez/seguridad (peso 2) | 8 | 6 | **Authentik** |
| DX/Admin UI (peso 2) | 10 | 8 | **Authentik** |
| Licencia (peso 2) | 8 (MIT core) | 6 (BSL) | **Authentik** |
| Audit logs (peso 1) | 7 | 10 | **Zitadel** |
| Comunidad/soporte (peso 1) | 7 | 6 | **Authentik** |
| Riesgo de abandono (peso 1) | 6 | 7 | **Zitadel** |
| **TOTAL ponderado** | **88** | **77** | **Authentik** |

---

## 7. Recomendación final

### Para VozLab: **Authentik** (con reservas)

**Razones:**
1. **LDAP nativo** — crítico para el caso de directorios locales (B2, B3, B5). Zitadel no lo tiene.
2. **SAML más maduro** — Entra ID puede usar SAML. Authentik tiene más años de SAML.
3. **Licencia MIT** — más segura legalmente que BSL. El core nunca cambiará de licencia.
4. **UI superior** — flows visuales, mejor DX para un equipo pequeño.
5. **MFA más completo** — SMS, email, Duo (aunque algunos son EE).

**Reservas:**
1. **Más pesado** — 5 procesos, ~1GB RAM. Pero mucho menos que Keycloak (~2GB).
2. **EE para features avanzadas** — SCIM, SAML avanzado, MFA por SMS/email son de pago. Si los necesitamos, tendremos que pagar o implementar alternativas.
3. **Riesgo de startup** — goauthentik es una startup VC. Si cierra, el proyecto puede estancarse. Pero el core es MIT, así que se puede fork.

### Si el peso es el factor decisivo: **Zitadel**

- Ultra-ligero (~128MB RAM, ~50MB imagen).
- Multi-tenant nativo (mejor que Authentik para cientos de instituciones).
- Event sourcing (audit log inmutable).
- Pero: sin LDAP nativo, BSL para features enterprise, menos maduro.

**Para VozLab (que necesita LDAP):** Authentik es la mejor opción entre los dos. Si en el futuro el peso se vuelve un problema, se puede migrar a Zitadel + un proxy LDAP (como LLDAP) como intermediario.

### Lo que NO recomiendo

- **Keycloak** si el peso es el problema principal (JVM, ~2GB RAM, arranque lento).
- **Zitadel** si se necesita LDAP nativo (no lo tiene).
- **Dex/Ory/Kanidm** (insuficientes para VozLab).

---

## 8. Plan de migración (Keycloak → Authentik)

Si se decide migrar:

1. **Levantar Authentik** en el lab (compose ya existe en `docker/identity-lab/authentik/`).
2. **Configurar realm equivalente**: crear aplicación OIDC `vozlab-api`, usuario de prueba `testuser`/`testpass`, mapper `tid=sabana`.
3. **Configurar LDAP federation** (si se usa LLDAP/OpenLDAP) via outpost LDAP.
4. **Actualizar `.env`** del API: cambiar `OIDC_*` URLs a Authentik (`http://localhost:9000`).
5. **Probar login** (B7 smoke test equivalente).
6. **Verificar claims** (`tid`, `email_verified`, `sub`, `aud`, `iss`).
7. **Actualizar docs** (README del lab, runbook-dev).
8. **Marcar B1/B4/B6 como re-hechos** para Authentik.

**Tiempo estimado:** 1-2 días (la configuración es por UI, no por JSON de realm import).

---

## 9. Decisión propuesta

1. **Migrar de Keycloak a Authentik** por peso, DX y LDAP nativo.
2. **Aceptar el riesgo de startup** (goauthentik es VC-backed, pero el core es MIT).
3. **No pagar EE** a menos que se necesite SCIM/SAML avanzado/MFA por SMS. Implementar alternativas (sync manual, SAML básico, TOTP/WebAuthn).
4. **Monitorear Zitadel** como alternativa futura si el multi-tenant de Authentik no escala.

---

*Fuentes: documentación oficial de Authentik y Zitadel, GitHub, Docker Hub, análisis de licencias, comunidad (2025-2026).*