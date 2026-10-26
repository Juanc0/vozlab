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

## Configurar (primera vez)

1. Acceder a la consola con las credenciales de admin.
2. Crear un proyecto (ej: "vozlab").
3. Crear una aplicación OIDC (tipo Web, auth method Basic).
4. Generar client secret.
5. Crear un usuario de prueba (email verified, password).
6. Obtener el org ID (de la URL o de los claims del token).
7. Actualizar `.env` con los valores de Zitadel.
8. Actualizar `tenants.oidc_tenant_id` en la DB al org ID de Zitadel.

## Notas

- Zitadel usa `urn:zitadel:iam:user:resourceowner:id` como claim de tenant (no `tid` ni `hd`).
- El API ya soporta este claim (fallback en OidcProviderClient).
- Zitadel no tiene LDAP nativo. Si se necesita LDAP, usar Authentik o un proxy LDAP.
- Zitadel no tiene SCIM ni MFA por SMS en el core (son BSL/pago).
