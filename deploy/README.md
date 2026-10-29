# deploy/ — producción topology T2 (ADR-0043)

| Path | Qué es |
|---|---|
| `caddy/Caddyfile` | Reverse proxy T2: TLS automático (Let's Encrypt), HTTP→HTTPS, HSTS + headers por sitio, `reverse_proxy` a `127.0.0.1:5173/3000/8081`. Los hostnames `example.com` son placeholders: sustituir por el dominio real (o inyectarlos con `{$DOMAIN}`-style env). |

El runbook paso a paso está en [`docs/ops/production-deployment.md`](../docs/ops/production-deployment.md).

## La matriz de las 7 URLs — checklist al cambiar de hostname

Todo el dolor de callbacks del proyecto cabe de este registro. Con
`app.example.com` / `api.example.com` / `auth.example.com`:

| # | URL exacta | Dónde se registra |
|---|---|---|
| 1 | `https://api.example.com/api/v1/auth/callback` | app OIDC `vozlab-api` en Zitadel (redirect URIs) — `API_CALLBACK` de `scripts/setup-zitadel.sh` |
| 2 | `https://app.example.com` | app OIDC en Zitadel (post-logout) — `WEB_ORIGIN` del script |
| 3 | `https://app.example.com` | API: `WEB_ORIGIN` (CORS + redirect post-login) |
| 4 | `https://api.example.com/api/v1` | web: `PUBLIC_API_BASE_URL` (runtime, no rebuild) |
| 5 | `https://auth.example.com` (+ `/oauth/v2/*`, `/oidc/v1/userinfo`, `/oauth/v2/keys`) | API: `OIDC_ISSUER` y los `OIDC_*_URL` |
| 6 | `https://auth.example.com/ui/login/login/externalidp/callback` | OAuth client de **Google** Cloud Console y de **Azure Entra** (social logins, B9) |
| 7 | `auth.example.com` / `443` / `true` | Zitadel: `ZITADEL_EXTERNALDOMAIN` / `EXTERNALPORT` / `EXTERNALSECURE` |

Reglas que hacen esto predecible:

- `scripts/setup-zitadel.sh` **mergea** redirect URIs (no reemplaza): registrar
  el hostname nuevo no rompe los existentes (localhost, zrok).
- Ninguna topología adoptada usa bases relativas: `PUBLIC_API_BASE_URL` es
  absoluta (T3 rechazada en ADR-0043; el código que la soportaba se eliminó).
- `app.` y `api.` deben seguir compartiendo dominio registrable: el refresh
  cookie es `SameSite=Lax` y eso solo funciona same-site.
