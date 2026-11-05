# Zitadel (identity broker — replaces Keycloak)

Lighter alternative to Keycloak (Go binary, ~128MB RAM vs ~1-2GB).
Multi-tenant native, OIDC + SAML 2.0, event sourcing audit logs.

## Levantar

The compose file now reads `ZITADEL_MASTERKEY` (and the rest of the
variables) from the root `.env` via `env_file`, and stores the bootstrap
PAT on the host under `./.zitadel-bootstrap` (bind mount, so it is
readable without `docker cp`).

```bash
# Load the dev (localhost) environment once per shell:
source scripts/env.sh local

# Or, if you keep everything in .env (zrok demo), just:
#   source scripts/env.sh

docker compose -f docker/identity-lab/zitadel/compose.yml up -d
until curl -fsS -o /dev/null http://localhost:8081/debug/ready; do sleep 2; done
```

Console: http://127.0.0.1:8081/ui/console
Admin: `zitadel-admin@zitadel.localhost` / `Password1!`

> The admin login embeds the **external domain**: with
> `ZITADEL_EXTERNALDOMAIN=localhost` it is `zitadel-admin@zitadel.localhost`;
> behind zrok (`ZITADEL_EXTERNALDOMAIN=vozlabauth.share.zrok.io`) it becomes
> `zitadel-admin@zitadel.vozlabauth.share.zrok.io`, and the console is only
> reachable through the public hostname. The domain is fixed at first init —
> changing it requires `./scripts/dev-up.sh --reset`.

> The first init writes `admin.pat` and `login-client.pat` to
> `./.zitadel-bootstrap/` on the host. That directory is gitignored; never
> commit it.

- Console: http://127.0.0.1:8081/ui/console
- Admin: zitadel-admin@zitadel.localhost / Password1!
- OIDC endpoints: http://localhost:8081/oauth/v2/authorize, /oauth/v2/token, /oauth/v2/keys

## Provisionar (sin consola)

El primer init crea el machine user `vozlab-bootstrap` con rol `IAM_OWNER` y
escribe su PAT en `./.zitadel-bootstrap/admin.pat` (bind mount, legible
directamente desde el host — sin `docker cp`).

```bash
export ZITADEL_CONTAINER=vozlab-zitadel-zitadel-1
ZITADEL_URL=http://localhost:8081 ./scripts/setup-zitadel.sh
```

El script:

1. Lee el org ID (`GET /management/v1/orgs/me`).
2. Crea o reutiliza el proyecto `vozlab`.
3. Crea o reutiliza la app OIDC `vozlab-api` (merge de redirect URIs, rota el
   client secret).
4. Crea o reutiliza el usuario `testuser`.
5. Imprime el bloque `OIDC_*` para `.env`, las credenciales de prueba y el SQL
   que actualiza `tenants.oidc_tenant_id` para el slug `sabana`.

Si el PAT no existe (la DB ya estaba inicializada), el script imprime los pasos
para regenerarlo. Alternativa manual: crear un machine user con rol `IAM_OWNER`,
generar un PAT y pasarlo como `ZITADEL_ADMIN_PAT=...`.

## Notas

- Zitadel usa `urn:zitadel:iam:user:resourceowner:id` como claim de tenant (no `tid` ni `hd`).
- El API lo acepta como tercer fallback en `OidcProviderClient.exchangeCode`
  (`tid` → `hd` → claim de Zitadel). Ese fallback se agregó el 2026-11-04:
  antes el login con Zitadel fallaba con `ERR_OIDC_EXCHANGE_FAILED`.
- Zitadel v4 **no** permite desactivar el prompt de inicialización de MFA por
  configuración (`MULTIFACTORS_INITSKIP` se ignora y la API v1 rechaza
  `mfaInitSkipLifespan`). En el lab, el primer login pide configurar un
  segundo factor: se pulsa **Skip** y la sesión continúa.
- `admin.pat` es un secreto de laboratorio: no commitearlo ni reutilizarlo fuera de dev.
- Zitadel no tiene LDAP nativo. Si se necesita LDAP, usar Authentik o un proxy LDAP.
- Zitadel no tiene SCIM nativo; el aprovisionamiento es vía API de management.
- Versión fijada: `ghcr.io/zitadel/zitadel:v4.16.0`. No cambiar sin actualizar
  `scripts/setup-zitadel.sh` (el login anónimo por `/v2/sessions` ya no existe).
