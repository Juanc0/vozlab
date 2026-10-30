# Runbook — despliegue de producción (topology T2, ADR-0043)

> Cierra la parte operativa de B11/v6-TASK-12 sobre el esquema ya validado:
> matriz de URLs en [`deploy/README.md`](../../deploy/README.md), análisis en
> [`production-topology-b11.md`](../analysis/production-topology-b11.md).
> La demo zrok (ADR-0040) **no se toca**: este runbook añade un entorno, no
> reemplaza el existente.

## 0. Requisitos

- Dominio propio con control DNS (registros `app.` , `api.` , `auth.`).
- Un host (≥2 vCPU / 4 GB recomendado: API + web + Zitadel + postgres + redis;
  Ollama y los workers en el mismo host solo si hay capacidad).
- Docker + docker compose en el host. Caddy binario o contenedor.
- Imágenes `vozlab-api` / `vozlab-web` (ya verificadas build+arranque+`/health`
  el 2026-10-29), `vozlab/postgres:18-age-pgvector`, redis 7, Zitadel v4.16.

## 1. Red y DNS (primero, porque Caddy bloquea aquí)

1. Registros A/AAAA: `app.example.com`, `api.example.com`, `auth.example.com`
   → IP del host.
2. Firewall: **solo** 80/443 entrantes. `3000`, `5173`, `8081`, `5432`, `6379`,
   `11434`, `8080` (zitadel interno) nunca públicos.
3. Sin DNS correcto, Caddy no emite certificado y todo lo demás falla con
   errores ACME confusos.

## 2. Base de datos y stack

Toda la topología T2 vive en **`docker-compose.prod.yml`** (re-alineado el
2026-10-29 con la decisión: Zitadel + Caddy añadidos, puertos de backend
solo-loopback, `floci` devuelto de `volumes:` a `services:`, y los scripts
initdb de dev **desmontados** porque fijan `vozlab_tenant_dev`). Con `.env`
ya copiado de `.env.production.example`:

```bash
# 1) Solo el DBMS, para crear las bases con los nombres de producción
docker compose -f docker-compose.prod.yml up -d postgres
docker exec -it vozlab-postgres psql -U postgres -c "CREATE DATABASE vozlab_router;"
docker exec -it vozlab-postgres psql -U postgres -c "CREATE DATABASE vozlab_tenant_prod;"
# 2) Extensiones en el tenant: aplica el contenido de
#    packages/database/scripts/02-extensions-and-graph.sql con tu
#    TENANT_DB_NAME (AGE + pgvector), p.ej.:
docker exec -i vozlab-postgres psql -U postgres -d vozlab_tenant_prod \
  < <(sed 's/vozlab_tenant_dev/vozlab_tenant_prod/' packages/database/scripts/02-extensions-and-graph.sql)
# 3) Stack completo: el one-shot `migrate` aplica router+tenant y luego
#    arrancan api, web, zitadel, workers y caddy
docker compose -f docker-compose.prod.yml up -d
```

Postgres arranca **nuevo** (no copiar el volumen dev). Sembrar solo lo que
aplique (el seed dev fixture NO es para producción). Para validar el archivo
de compose **sin** `.env` (p. ej. en CI o antes de copiarlo), el `config -q`
exige valores dummy para las variables obligatorias `:?`:

```bash
APP_HOSTNAME=h API_HOSTNAME=h AUTH_HOSTNAME=h ACME_EMAIL=e@x ZITADEL_DB_PASSWORD=d \
ZITADEL_MASTERKEY=d docker compose -f docker-compose.prod.yml config -q
```

## 3. Zitadel

El servicio `zitadel` (+ `zitadel-db`) ya está definido en
`docker-compose.prod.yml`; las variables de la instancia se derivan del
`.env` (`AUTH_HOSTNAME` → `ZITADEL_EXTERNALDOMAIN`, `443`,
`EXTERNALSECURE=true`) y los secrets (`ZITADEL_DB_PASSWORD`,
`ZITADEL_MASTERKEY`) son obligatorios con `:?`.

Zitadel sirve HTTP plano en 8080, publicado solo en `127.0.0.1:8081`; es
Caddy quien termina TLS. La instancia resuelve el tenant por Host, por eso el
`EXTERNALDOMAIN` debe coincidir con el DNS. El PAT de bootstrap queda en
`${ZITADEL_BOOTSTRAP_DIR:-./zitadel-bootstrap}/admin.pat` en el host (lo lee
`scripts/setup-zitadel.sh`).

## 4. Registro OIDC — una pasada del script

Desde el host (management por localhost, issuer público), con las
credenciales sociales de B9 si ya existen:

```bash
ZITADEL_URL=http://localhost:8081 \
ZITADEL_PUBLIC_URL=https://auth.example.com \
API_CALLBACK=https://api.example.com/api/v1/auth/callback \
WEB_ORIGIN=https://app.example.com \
ZITADEL_GOOGLE_CLIENT_ID=… ZITADEL_GOOGLE_CLIENT_SECRET=… \
ZITADEL_MICROSOFT_CLIENT_ID=… ZITADEL_MICROSOFT_CLIENT_SECRET=… \
./scripts/setup-zitadel.sh
```

El script **mergea** redirects (no rompe los de la demo/localhost), rota el
client secret (actualizar `.env` y reiniciar la API) y aplica los social
logins. Copiar el `ORG_ID` impreso y escribirlo en el router:

```sql
UPDATE public.tenants SET oidc_tenant_id = '<ORG_ID>' WHERE slug = '<slug>';
```

## 5. Aplicación

`.env` de producción (a partir de `.env.example`), valores finales de la
matriz de 7 URLs en [`deploy/README.md`](../../deploy/README.md):

- API: `NODE_ENV=production` (activa `Secure` en el cookie de refresh),
  `WEB_ORIGIN=https://app.example.com`, `OIDC_*=https://auth.example.com/…`,
  `OIDC_REDIRECT_URI=https://api.example.com/api/v1/auth/callback`.
- **Pendiente T9**: `EMAIL_PEPPER` (≥ 32 chars, obligatorio en `env.ts` desde
  el pepper de hashes de email — DEC-4) se añade al secret set de producción;
  valor aleatorio nuevo, distinto de `JWT_SECRET`.
- Web: `PUBLIC_API_BASE_URL=https://api.example.com/api/v1` (runtime: se
  cambia sin rebuild).
- `trustProxy` ya está configurado (`apps/api/src/infrastructure/http/proxyTrust.ts` = loopback + RFC1918/ULA en CIDRs literales; los nombres `loopback`/`private` de Express **no** los acepta proxy-addr): Caddy conecta vía el puerto publicado en 127.0.0.1 y, dentro del contenedor, el peer resulta ser el gateway del bridge Docker (172.16/12 — rango privado), con lo que la IP real del cliente llega en `X-Forwarded-For` y los buckets de rate limit anónimos son correctos. **Ninguna IP privada es enrutable desde internet**, así que no hay spoofing posible. Si el proxy alguna vez vive fuera del host (T1), estrechar el valor al CIDR real del proxy.

```bash
docker compose --profile app --profile idp up -d
docker compose --profile workers up -d
```

## 6. Caddy (si aún no corrió el `up -d` del §2)

El servicio `caddy` de `docker-compose.prod.yml` usa `network_mode: host`,
monta [`deploy/caddy/Caddyfile`](../../deploy/caddy/Caddyfile) y recibe
`APP_HOSTNAME`/`API_HOSTNAME`/`AUTH_HOSTNAME`/`ACME_EMAIL` del `.env` (el
Caddyfile los consume con `{$VAR:default}`, así que el mismo archivo sirve
para validar sin env). Antes del `up`, validar:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile
```

## 7. Verificación post-despliegue

- [ ] `https://api.example.com/health` → `{"status":"alive"}`.
- [ ] Login completo (test user) app → auth → callback → selector de tenant;
      evento `OIDC_LOGIN` y `TENANT_SELECTED` en `global_user_events`.
- [ ] Cookie `vozlab_refresh`: `Secure` + `HttpOnly` + `Path=/api/v1/auth`.
- [ ] Logout → post-logout landing en `https://app.example.com`.
- [ ] Social logins (si se configuraron): botones Google/Microsoft en la
      página de login, JIT user creado.
- [ ] PWA instalable; service worker registra (HTTPS = secure context).
- [ ] Rate limit anónimo: dos IPs distintas → buckets distintos (verificar
      que `req.ip` no es 127.0.0.1 en los logs).
- [ ] TASK-12.3 pendiente aquí: afinar la CSP del sitio `app.` contra el
      build real (SvelteKit puede emitir bootstrap inline) antes del go-live.

## 8. Notas operativas

- **Redis guarda el estado OIDC (PKCE)**: flush de Redis a mitad de un login
  en vuelo → `ERR_INVALID_OIDC_STATE` en ese intento. No es corrupción; evita
  flushear durante horas pico de login.
- Backup: `pg_dump` de router + cada tenant + la DB de Zitadel, en el mismo
  ciclo. La demo zrok no comparte nada con este entorno.
- Migración futura a T1 (LBs administrados): solo se mueve el DNS y se
  reemplaza Caddy por los listeners; las 7 URLs no cambian (mismo modelo de
  orígenes, ADR-0043).
