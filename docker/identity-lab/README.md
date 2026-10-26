# VozLab identity lab

Laboratorio local para probar login, tokens, roles y aislamiento entre instituciones.

## Levantar (B1)

```bash
docker compose -f docker/identity-lab/compose.yml up -d
```

- Keycloak: http://127.0.0.1:8080 (admin/admin, solo dev)
- Redis: 127.0.0.1:6379
- Realm importado automáticamente: `vozlab` (con cliente `vozlab-api`, usuario `testuser`/`testpass`, claim `tid=sabana`).

## LLDAP (B2)

```bash
docker compose -f docker/identity-lab/lldap/compose.yml up -d
```

- Interfaz: http://127.0.0.1:17170 (admin/adminpass)
- LDAP: 127.0.0.1:3890, base DN `dc=example,dc=org`.
- Crear 5 usuarios y 3 grupos desde la interfaz web.
- Verificar con `ldapsearch -x -H ldap://127.0.0.1:3890 -D "cn=admin,ou=people,dc=example,dc=org" -w adminpass -b "dc=example,dc=org"`.

## Samba AD DC (B3, opcional)

```bash
docker compose -f docker/identity-lab/samba/compose.yml up -d
```

- LDAP: 127.0.0.1:389, dominio `VOZLAB.LOCAL`.
- Crear usuarios/grupos con `samba-tool user create` / `samba-tool group add`.
- Verificar bajas con `userAccountControl`.

## Federación LLDAP en Keycloak (B5)

En Keycloak (http://127.0.0.1:8080), realm `vozlab` → User federation → Add provider → LDAP:

- Vendor: Other
- Connection URL: `ldap://host.docker.internal:3890`
- Users DN: `ou=people,dc=example,dc=org`
- Bind DN: `cn=admin,ou=people,dc=example,dc=org`
- Bind credential: `adminpass`
- Username LDAP attribute: `uid`
- RDN LDAP attribute: `uid`
- UUID LDAP attribute: `uid`
- User object classes: `inetOrgPerson, organizationalPerson`
- Edit mode: READ_ONLY
- Import users: ON

Probar login con un usuario del directorio.

## Claim `tid` y claims canónicos (B6)

El realm import ya incluye el mapper `tid=sabana` (hardcoded, id/access/userinfo token). Claims canónicos verificados en el token:

- `iss` = `http://localhost:8080/realms/vozlab`
- `sub` = UUID del usuario
- `aud` = `vozlab-api`
- `tid` = `sabana`
- `email_verified` = `true` (configurado en el usuario)

## Prueba de humo (B7)

1. Levantar Postgres/Redis del compose principal y aplicar migraciones + seed:
   `pnpm --filter @vozlab/database db:migrate:router && db:migrate:tenant && db:seed:dev`
2. Levantar la API: `pnpm --filter @vozlab/api dev`
3. Abrir http://localhost:3000/api/v1/auth/login (o iniciar flujo desde el PWA).
4. Login con `testuser`/`testpass`.
5. Verificar que el callback devuelve un refresh cookie y que `GET /api/v1/auth/me` responde 200 con `tid=sabana`.

No guardar secretos en el repositorio.

## Authentik (B8, opcional)

```bash
docker compose -f docker/identity-lab/authentik/compose.yml up -d
```

- Interfaz: http://127.0.0.1:9000.
- Crear usuario de prueba, aplicación OIDC y aplicación SAML; comprobar LDAP outpost con `ldapsearch`.

## SAML 2.0 entre dos realms (B9)

1. El realm `vozlab-idp` se importa automáticamente (archivo `realm-import/vozlab-idp-realm.json`) con usuario `idpuser`/`idppass` y cliente SAML `vozlab-sp`.
2. En el realm `vozlab` (SP): Identity Providers → Add provider → SAML 2.0.
   - Alias: `vozlab-idp`
   - Single Sign-On Service URL: `http://localhost:8080/realms/vozlab-idp/protocol/saml`
   - Principal Type: Subject NameID
   - Name ID Policy Format: `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`
3. Hacer login desde el realm `vozlab` usando el IdP; verificar que el token contiene los atributos esperados.

Solo SAML 2.0 (no 1.1).

## Notas

- `start-dev` es solo para laboratorio, no para producción.
- No se guardan secretos en el repositorio.