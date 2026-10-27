# OIDC Applications in Zitadel

## Application Types

| Type | Use Case | Auth Flow |
|------|----------|-----------|
| Web | Server-side apps | Authorization Code |
| Native | Mobile/Desktop | Authorization Code + PKCE |
| User Agent | SPAs | Authorization Code + PKCE |
| API | Machine-to-machine | Client Credentials |

## Creating a Web Application

### Via Console UI

1. Access: `https://auth.example.com/ui/console`
2. Navigate: Organization → Projects → Your Project → Applications
3. Click: **+ New**
4. Select: **Web Application**
5. Configure:
   - Name: Application name
   - Redirect URIs: `https://app.example.com/callback`
   - Post Logout URIs: `https://app.example.com/`
6. Save and copy **Client ID** and **Client Secret**

### Common Redirect URIs

| Application | Redirect URI |
|-------------|--------------|
| Nextcloud | `https://files.example.com/apps/user_oidc/code` |
| Windmill | `https://windmill.example.com/user/login_callback/zitadel` |
| Grafana | `https://grafana.example.com/login/generic_oauth` |
| n8n | `https://n8n.example.com/rest/oauth2-credential/callback` |

## Nextcloud Integration

### Install user_oidc App

```bash
docker exec nextcloud php occ app:install user_oidc
docker exec nextcloud php occ app:enable user_oidc
```

### Configure OIDC

```bash
# Set issuer
docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-issuer \
  --value="https://auth.example.com"

# Set client credentials
docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-client-id \
  --value="<CLIENT_ID>"

docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-client-secret \
  --value="<CLIENT_SECRET>"

# Set scopes
docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-scope \
  --value="openid profile email"

# Use ID token for userinfo
docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-use-id-token-for-userinfo \
  --value="1"

# Map user attributes
docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-mapping-uid \
  --value="email"

docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-mapping-display-name \
  --value="name"

docker exec nextcloud php occ config:app:set user_oidc \
  openid-connect-mapping-email \
  --value="email"
```

### Verify Configuration

```bash
docker exec nextcloud php occ config:app:get user_oidc
```

## Service Users (Machine-to-Machine)

### Create Service User

1. Console: Organization → Users → Service Users
2. Click: **+ New**
3. Enter: Username, Display Name
4. Save

### Generate Personal Access Token (PAT)

1. Open service user details
2. Navigate: Personal Access Tokens
3. Click: **New**
4. Set expiration (optional)
5. **Copy token immediately** (not shown again)

### Assign Roles

1. Go to Organization details
2. Click **+** in top right
3. Search for service user
4. Assign role (e.g., Org Owner, Project Owner)

### Use PAT for API Access

```bash
curl -H "Authorization: Bearer <PAT>" \
  https://auth.example.com/management/v1/orgs/me
```

## OIDC Endpoints

| Endpoint | URL |
|----------|-----|
| Discovery | `/.well-known/openid-configuration` |
| Authorization | `/oauth/v2/authorize` |
| Token | `/oauth/v2/token` |
| Userinfo | `/oidc/v1/userinfo` |
| End Session | `/oidc/v1/end_session` |
| JWKS | `/oauth/v2/keys` |

### Discovery Document

```bash
curl https://auth.example.com/.well-known/openid-configuration | jq
```

## Scopes

| Scope | Claims Included |
|-------|-----------------|
| openid | sub |
| profile | name, family_name, given_name, nickname, preferred_username, picture, updated_at |
| email | email, email_verified |
| address | address |
| phone | phone_number, phone_number_verified |

## Official Documentation

- OIDC Concepts: https://zitadel.com/docs/guides/integrate/login/oidc
- Service Users: https://zitadel.com/docs/guides/integrate/service-users/personal-access-token
- Client Credentials: https://zitadel.com/docs/guides/integrate/service-users/client-credentials
