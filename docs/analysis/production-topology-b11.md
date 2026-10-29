# Topologías de despliegue (B11) — análisis para producción y preparación sin romper la demo

> Fecha: 2026-10-29 · Status: **DECIDIDO — T2 adoptada, T3 rechazada
> ([ADR-0043](../decisions/ADR-0043-production-topology-caddy-t2.md))**.
> Preps P1–P3 y P5 aplicadas en la misma tanda; P4 (CI) y el despliegue real
> siguen pendientes del hostname.
> Relacionado: [ADR-0040](../decisions/ADR-0040-zrok-three-shares-demo.md),
> [ADR-0033](../decisions/ADR-0033-demo-topology-single-host.md),
> [committee review §B11](auth-onboarding-committee-review.md),
> [runbook zrok](../ops/runbook-demo-zrok.md),
> [runbook producción](../ops/production-deployment.md).

## 0. TL;DR

- La demo actual (zrok) **ya tiene la forma exacta de las topologías 1 y 2**: tres
  orígenes públicos estables con TLS terminado "afuera". Migrar de zrok a
  producción en esas topologías es **sustituir hostnames**, no re-arquitectar.
- La topología 3 (origen único `/api`) es la que **sí** cambiaría la forma — y es
  la que ADR-0040 abandonó deliberadamente.
- El dolor de callbacks que pasamos se reduce a **7 URLs registradas en 4 sitios**;
  hay una matriz (§3) y cada topología la aplica de forma predecible.
- Hay 5 preparaciones sin riesgo para la demo (§5); 3 de ellas se pueden hacer ya.

## 1. Por qué los callbacks dolieron con zrok (causa raíz)

No fue casualidad: el stack tiene **cuatro superficies de red distintas** que
deben conocer sus nombres mutuos, y cada hostname nuevo las toca:

1. **Zitadel resuelve la instancia por `Host` header** + `ZITADEL_EXTERNALDOMAIN/
   PORT/SECURE`. Si el issuer público cambia sin recompensar el header →
   `404 Instance not found`. El script ya deriva `ZITADEL_HOST_HEADER` y
   `X-Forwarded-Proto` del `ZITADEL_PUBLIC_URL` por eso.
2. **El OIDC app de Zitadel lista redirect URIs exactos** (string equality):
   `API_CALLBACK` (→ `.../api/v1/auth/callback`) y `post_logout` (→ `WEB_ORIGIN`).
   Cada origen nuevo = re-registrar. Por eso `setup-zitadel.sh` **mergea** URIs
   (`EXTRA_REDIRECT_URIS`) en vez de reemplazar: localhost + zrok conviven.
3. **El estado PKCE vive en Redis** (`IOidcStateStore.consume` — si Redis está
   caído o es *otra* instancia, el callback devuelve `ERR_INVALID_OIDC_STATE`;
   de ahí la nota de AGENTS.md sobre el conflicto de puertos).
4. **Cookies cross-origin**: el refresh cookie lo fija la API en SU dominio
   (`Path=/api/v1/auth`, `SameSite=Lax`) y la PWA lo usa con
   `credentials: 'include'` sobre CORS (`origin: true, credentials: true`,
   `server.ts:132-135`). Funciona mientras web y API **compartan registrable
   domain** (`*.share.zrok.io`, o `app.`/`api.` de un dominio propio en
   producción — ver nota de `authCookies.ts:9`). Si algún día web y API viven en
   domitorios *distintos* (ej. `vozlab.io` + `vozlab-api.io`), Lax no basta: haría
   falta `SameSite=None; Secure` y es otro punto de dolor. Las tres topologías de
   §2 lo evitan.

## 2. Las tres topologías, con implicaciones concretas para VozLab

### T1 — Balanceador/CDN administrado por servicio (ALB, CloudFront, Cloudflare Tunnel)

```
                    ┌─ app.example.com  → LB → vozlab-web   (adapter-node :3000)
Internet ── TLS ────┼─ api.example.com  → LB → vozlab-api   (Fastify :3000)
 (LB termina TLS)   └─ auth.example.com → LB → zitadel      (:8081)
                      (postgres, redis, ollama, workers: solo red interna, nunca expuestos)
```

- **Qué es**: el clon production-grade de la demo. zrok hace exactamente esto
  (TLS en el borde, un hostname por servicio, orígenes estables). En AWS: un ALB
  con 3 listener rules por hostname, o 3 ALBs; certificado en ACM; `Route53`.
- **Pros**: cero código nuevo (los envs actuales se copian tal cual); CORS ya
  probado en la demo; TLS gestionado por el cloud; los workers/API siguen
  escuchando HTTP plano localhost/interno sin exponer nada.
- **Contras**: costo fijo (~USD 20-40/mes por ALB), vendor lock-in de DNS/LB,
  HSTS/CSP fino hay que ponerlos como header rules del LB (o en el target).
- **Cambios necesarios**: registrar el set de 7 URLs (matriz §3) con
  `app/api/auth.example.com`; `ZITADEL_EXTERNALSECURE=true`; `NODE_ENV=production`
  (activa `Secure` en el cookie de refresh — única línea de código afectada, ya
  existe); imagenes api/web de los contenedores (perfil `app`, ya validadas).

### T2 — Reverse proxy único en un host (Caddy o Traefik)

```
Internet ──443──▶ Caddy ──┬─ app.example.com → localhost:5173 (web build/SSR)
             (termina TLS ├─ api.example.com → localhost:3000 (API)
              + HSTS/CSP) └─ auth.example.com → localhost:8081 (Zitadel)
```

- **Qué es**: el "single host" de ADR-0033 con un Caddy delante. Caddy saca y
  renueva Let's Encrypt solo y añade HTTP→HTTPS redirect, HSTS y headers por
  bloque de servidor — es el lugar natural donde cerrar B11/TASK-12.3.
- **Pros**: mismo set de orígenes que la demo (la matriz §3 solo cambia
  hostnames); ~USD 5-20/mes VPS; un solo archivo `Caddyfile` declara toda la
  superficie pública; CSP/HSTS viven en UN sitio legible.
- **Contras**: el host es SPOF (mitigable con backups + reprovisionar); TLS
  depende de DNS bien apuntado (bootstrapping: el proxy no arranca con el
  dominio mal resuelto); operar cert botting propio vs ACM.
- **Cambios**: idénticos a T1 en lo de registro de URLs, más el Caddyfile. Los
  servicios siguen respondiendo HTTP local; Zitadel con `EXTERNALSECURE=true`
  (Caddy ya terminó TLS) y `EXTERNALDOMAIN=auth.example.com`.

### T3 — Origen único (proxy de ruta: `app.example.com` sirve web y reenvía `/api` a la API)

```
Internet ──443──▶ Caddy ──┬─ /api/*  → vozlab-api
   un solo origen          ├─ /*      → vozlab-web
 (auth sigue aparte)       └─ auth.example.com → zitadel  ← sigue necesitando su dominio
```

- **Qué es**: el modelo que la demo ABANDONÓ con ADR-0040 (era el
  `demo-proxy.mjs` con `PUBLIC_API_BASE_URL=/api/v1` relativo).
- **Pros**: el mejor modelo de cookies (web y API mismo origen → ni CORS ni
  SameSite importan); un hostname que registrar; supercie pública mínima.
- **Contras para ESTE proyecto**:
  - **Regresa el acoplamiento que ADR-0040 eliminó**: el proxy tiene que saber
    el shape de ambas apps (`/api/v1/*` vs el resto) — un punto de sincronización
    humano que ya se quemó una vez.
  - **auth.example.com sigue siendo origen aparte** (Zitadel necesita su propio
    issuer), así que NO elimina la superficie OIDC: solo colapsa web+api.
  - Rompería la simetría demo↔producción que hoy existe: la demo correría
    cross-origin y producción same-origin → bugs que solo aparecen en un lado.
  - El E2E (que hoy sirve la API en `:3100` y la web en `:5174`) divergiría.
- **Resuelto con la decisión**: el soporte de URL relativas de
  `normalizeApiBaseUrl()` (la pieza que T3 necesitaría) **se eliminó** al
  rechazar T2 sobre T3 — configurar una base relativa (`/api/v1`) ahora cae
  al default de localhost, igual que cualquier valor no absoluto.
- **Veredicto**: no recomendada; es estrictamente peor que T1/T2 para la
  topología multi-origen que ya está probada en la demo.

### Comparación

| | T1 administrado | T2 Caddy 1 host | T3 origen único |
|---|---|---|---|
| Simetría con la demo actual | **1:1** | 1:1 | pierde (diferente modelo de origen) |
| Dolor OIDC/redirects futuro | mismo 7 URLs | mismo 7 URLs | 5 URLs (auth 2 siguen) |
| Cookies/CORS | same-site wildcard | same-site wildcard | mismo origen (cero) |
| Dónde viven HSTS/CSP | LB header rules | Caddyfile | Caddyfile |
| SPOF | mitigado por cloud | host único | host único |
| Costo típico/mes | ~20-40 | ~5-20 | ~5-20 |
| Operación | menos (AWS hace TLS) | Caddy hace todo | como T2 + routing |
| Escala multi-tenant | directa | directa (host mayor) | directa |

**Recomendación**: T2 para el primer despliegue real (barato, explícito, y un
solo sitio donde se declaran TLS/HSTS/CSP), con T1 como migración natural si el
proyecto crece (la matriz de URLs de ambas es idéntica — la decisión es reversible
en cualquier momento porque el modelo de origen no cambia).

## 3. La matriz de URLs — el mapa de callbacks completo

Hoy (demo zrok) → producción (T1/T2, mismo pattern). En `app./api./auth.example.com`:

| # | URL | Quién la consume / registra | Hoy (zrok) | T1/T2 | T3 |
|---|---|---|---|---|---|
| 1 | `OIDC_REDIRECT_URI` = API callback | app OIDC en Zitadel (redirect list) | `vozlabapi.../api/v1/auth/callback` | `https://api.example.com/api/v1/auth/callback` | igual |
| 2 | `API_CALLBACK` local | extra redirect en el mismo app | `localhost:3000/...` | puede seguir (dev local) | igual |
| 3 | `post_logout_redirect` | app OIDC en Zitadel | `vozlabdemo...` = `WEB_ORIGIN` | `https://app.example.com` | igual |
| 4 | `WEB_ORIGIN` (CORS + redirect post-login) | API env | zrok web share | `https://app.example.com` | mismo origen con API → `https://app.example.com` |
| 5 | `PUBLIC_API_BASE_URL` | web env (resuelta en runtime, `$env/dynamic/public`) | `https://vozlabapi.../api/v1` | `https://api.example.com/api/v1` | **`/api/v1` (relativo)** |
| 6 | `OIDC_ISSUER` + `AUTH/TOKEN/USERINFO/JWKS_URL` | API env; = `ZITADEL_PUBLIC_URL` | `https://vozlabauth...` | `https://auth.example.com` | igual (auth sigue aparte) |
| 7 | callback social IdP (B9) | Google Cloud + Azure Entra (redirect URI del OAuth client) | `vozlabauth.../ui/login/login/externalidp/callback` | `https://auth.example.com/ui/login/login/externalidp/callback` | igual |
| 8 | `ZITADEL_EXTERNALDOMAIN/PORT/SECURE` | la instancia Zitadel resuelve por Host | `vozlabauth... /443/true` (share) | `auth.example.com /443/true` | igual |

Reglas que hacen esto predecible (ya verificadas en código):

- **Redirect matching**: string-exacto. `setup-zitadel.sh` mergea (no reemplaza)
  — registrar el hostname nuevo no rompe el localhost ni el anterior.
- **`web` usa `$env/dynamic/public`** (`api-base-url.ts`): cambiar API → **no
  requiere rebuild**, solo env en el despliegue.
- **Issuer ≠ origin de sesión**: el callback OIDC SIEMPRE aterriza en la **API**,
  no en la web (por eso el cookie lo fija la API y el `WEB_ORIGIN` solo recibe
  el redirect final post-sesión).
- **El cookie de refresh es Lax + Path `/api/v1/auth`**: con subdominios de un
  mismo dominio (`app.`/`api.example.com`) sigue siendo same-site → Lax funciona
  sin tocar `authCookies.ts`. **Nunca separar `example.com` y `example-api.com`.**
- `NODE_ENV=production` activa `Secure` (authCookies) — en T1/T2/T3 el TLS
  termina fuera, pero los servicios ven `X-Forwarded-Proto`. **Necesario sí o
  sí con proxy delante**: `RateLimitingMiddleware.ts:249` encara el bucket
  anónimo por `req.ip`, y Fastify **no** tiene `trustProxy` activado — sin él,
  detrás de cualquier proxy (Caddy o incluso el borde zrok para el bucket
  anónimo) **todos los visitantes anónimos caen en el mismo bucket** (la IP del
  proxy). Activar `trustProxy: true` es inocuo sin proxy (sin cabeceras XFF,
  `req.ip` sigue siendo la del socket) → **se puede preparar ya** (P5).

## 4. Dónde está cada componente en producción real (referencia T2)

```
                        Internet
                           │ 443 (TLS, HSTS, CSP)
                      ┌────▼────┐
                      │  Caddy  │  Caddyfile = TODA la superficie pública declarada
                      └────┬────┘
        app.example.com ───┼─── api.example.com ─── auth.example.com
        (PWA SSR + static) │   (REST /api/v1)       (login, OIDC, IdPs)
                      ┌────▼────┐               (443→8081, X-Forwarded-Host)
                      │ web :5173│ (node build)     │ zitadel :8081 │
                      └────┬────┘                   └──────┬────────┘
                           │ fetch c/ credentials      admin API │ (PAT, solo localhost)
                      ┌────▼────┐                          │
                      │ api :3000│◀────────────────┐        │
                      └──┬───┬──┘                 │        ▼
           ROUTER_DB     │   │ REDIS     workers Python      (postgres interno,
        (vozlab_router)──┘   └──(vozlab_tenant_*) (stream:*)   zitadel-db)
              │
        postgres:5432 interno — NUNCA publicado
        redis:6379 interno    — NUNCA publicado
        ollama:11434 interno  — NUNCA publicado
```

- **Publicados**: solo 443. Nada de `:3000/:5173/:8081/:5432/:6379/:11434`
  expuestos (firewall/seguridad de grupo).
- **Comunicaciones**: web→API (fetch con cookie/Bearer); API→Zitadel (solo
  back-channel: token/userinfo/JWKS, server-side); workers→API (Bearer agent
  token); API→Postgres×2/Redis; Zitadel→su propia postgres. Ningún navegador
  habla con Postgres/Redis/Ollama ni con workers.
- **Persistencia crítica**: redis guarda el **estado OIDC PKCE** (§1.3) — si se
  vacía a mitad de un login, el callback da `ERR_INVALID_OIDC_STATE` (no es
  corrupción, pero es una razón para no redeployear redis con sesión de login
  en vuelo).
- Los **tokens de acceso** son Bearer en memoria (JS) — el único cookie es el
  refresh (HttpOnly, Path acotado). La PWA offline (3.7) re-verifica sesión
  contra la API; el service worker necesita **servir por HTTPS** (secure
  context) — en la demo ya lo cumple zrok; en local puro `localhost` también es
  secure context (razón por la que el dev sin TLS funciona).

## 5. Qué se puede preparar AHORA sin tocar la forma de la demo

### Sin riesgo (recomendado hacer ya)

> **Estado tras la decisión (2026-10-29): P1 ✔** (build + smoke: los dos
> contenedores arrancan y `/health` 200; se corrigió de paso `allowBuilds`
> protobufjs y `env_file` del perfil app), **P2 ✔** (`deploy/caddy/Caddyfile`
> + `deploy/README.md`), **P3 ✔** (`docs/ops/production-deployment.md`),
> **P4 pendiente**, **P5 ✔** (`proxyTrust.ts` + 5 tests).

| Prep | Qué es | Por qué es seguro | Cierra |
|---|---|---|---|
| **P1. Imagenes api/web verificadas** | `docker compose --profile app build api web` (Dockerfiles existen; el bloque estaba mal anidado y quedó corregido en `b28b5bc`) | No arranca nada; solo compila | "verificar build contenedores" de v6-12 |
| **P2. Plantilla de despliegue T2** | `deploy/caddy/Caddyfile.example` + `deploy/README.md` documentando las 7 URLs de la matriz §3 como checklist | Solo archivos nuevos; el demo no los lee | pre-req B11 |
| **P3. `docs/ops/production-deployment.md`** | el §3/§4 de aquí como runbook accionable (hostname final → 7 registros → envs → verificación) | doc puro | pre-req B11 |
| P4. CI job que corre `compose config` | gate de sintaxis IaC | no toca runtime | — |
| **P5. `trustProxy: true` en Fastify** | la API confía en `X-Forwarded-For`/`-Proto` del proxy → rate limit anónimo por IP real del cliente | sin proxy no hay cabeceras XFF → `req.ip` es la del socket, comportamiento idéntico en dev/E2E; detrás de zrok mejora el bucket (hoy cae en el borde) | pre-req B11 (limitación de abuso real) |

### Esperar a la decisión (cambiarían comportamiento o envs)

| No-hacer-aún | Por qué |
|---|---|
| `NODE_ENV=production` en la demo | activa `Secure` en cookies; con zrok *funciona* (HTTPS) pero no aporta nada y cambia el perfil de las pruebas E2E locales (HTTP) |
| `ZITADEL_EXTERNALSECURE=true` en el compose base | la instancia hoy sirve HTTP en localhost:8081 para dev directo; solo debe activarse en el entorno de despliegue |
| Tocar `authCookies.ts` (SameSite=None, etc.) | **no es necesario**: ninguna de las 3 topologías lo requiere; hacerlo ahora sería el peor movimiento |
| Relative `PUBLIC_API_BASE_URL=/api/v1` | solo aplica a T3; adoptarlo ahora reintroduciría el acoplamiento de ADR-0040 |
| HSTS con `preload` | el preload es semi-irreversible y aplica a TODOS los subdominios; se decide con el hostname final (hoy el header de la API ya es conservador y solo afecta al dominio de la API) |

## 6. Preguntas abiertas (resueltas 2026-10-29 salvo la 2-3)

1. ~~¿T2 o T1?~~ **Resuelto: T2** (decisión del usuario 2026-10-29,
   [ADR-0043](../decisions/ADR-0043-production-topology-caddy-t2.md)); T1
   queda disponible como swap de DNS porque el modelo de orígenes no cambia.
2. ¿Hostname final y subdominios fijos (`app. api. auth.`)? La matriz §3 y
   el `deploy/caddy/Caddyfile` se resuelven con eso. **Único bloqueante real.**
3. ¿Dónde se construyen/publican las imágenes (GHCR?) para el runner del
   despliegue.
4. ~~¿Se decide T3?~~ **Rechazada** (ADR-0043): el soporte de URL relativas
   de `api-base-url.ts` se eliminó; no queda nada latente que mantener.
