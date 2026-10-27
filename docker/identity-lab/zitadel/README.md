# Zitadel (identity broker — replaces Keycloak)

Lighter alternative to Keycloak (Go binary, ~128MB RAM vs ~1-2GB).
Multi-tenant native, OIDC + SAML 2.0, event sourcing audit logs.

## Levantar

```bash
export ZITADEL_MASTERKEY="MasterkeyNeedsToHave32Characters"
docker compose -f docker/identity-lab/zitadel/compose.yml up -d
```

- Console: http://127.0.0.1:8081/ui/console
- Admin: zitadel-admin@zitadel.localhost / Password1!
- OIDC endpoints: http://localhost:8081/oauth/v2/authorize, /oauth/v2/token, /oauth/v2/keys

## Provisionar (sin consola)

El primer init crea el machine user `vozlab-bootstrap` con rol `IAM_OWNER` y
escribe su PAT en el volumen `vozlab-zitadel_zitadel-bootstrap`
(`/zitadel/bootstrap/admin.pat`). El script lo lee con `docker cp` porque este
stack usa un volumen con nombre, no un bind mount.

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
- El API ya soporta este claim (fallback en OidcProviderClient).
- `admin.pat` es un secreto de laboratorio: no commitearlo ni reutilizarlo fuera de dev.
- Zitadel no tiene LDAP nativo. Si se necesita LDAP, usar Authentik o un proxy LDAP.
- Zitadel no tiene SCIM nativo; el aprovisionamiento es vía API de management.
- Versión fijada: `ghcr.io/zitadel/zitadel:v4.16.0`. No cambiar sin actualizar
  `scripts/setup-zitadel.sh` (el login anónimo por `/v2/sessions` ya no existe).
